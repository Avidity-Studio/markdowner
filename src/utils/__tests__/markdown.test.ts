import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderMarkdownToHtml, createMarkdownRenderer, configureMarked } from '../markdown'

// Mock DOMPurify
vi.mock('dompurify', () => ({
  default: {
    sanitize: vi.fn((html: string) => html),
  },
}))

describe('markdown utils', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createMarkdownRenderer', () => {
    it('should create a renderer', () => {
      const renderer = createMarkdownRenderer()
      expect(renderer).toBeDefined()
      expect(typeof renderer.code).toBe('function')
    })

    it('should handle mermaid code blocks specially', () => {
      const renderer = createMarkdownRenderer()
      const result = renderer.code({
        type: 'code',
        raw: '```mermaid\nflowchart TD\nA --> B\n```',
        text: 'flowchart TD\nA --> B',
        lang: 'mermaid',
        escaped: false,
      })

      expect(result).toContain('language-mermaid')
      expect(result).toContain('flowchart TD')
    })

    it('should handle regular code blocks with syntax highlighting', () => {
      const renderer = createMarkdownRenderer()
      const result = renderer.code({
        type: 'code',
        raw: '```javascript\nconst x = 1\n```',
        text: 'const x = 1',
        lang: 'javascript',
        escaped: false,
      })

      expect(result).toContain('language-javascript')
      expect(result).toContain('hljs')
      // The code should be highlighted (wrapped in spans)
      expect(result).toContain('const')
      expect(result).toContain('x')
    })

    it('should handle code blocks without language', () => {
      const renderer = createMarkdownRenderer()
      const result = renderer.code({
        type: 'code',
        raw: '```\nsome code\n```',
        text: 'some code',
        lang: undefined,
        escaped: false,
      })

      expect(result).toContain('<pre><code>')
      expect(result).toContain('some code')
    })

    it('should escape special characters in mermaid code', () => {
      const renderer = createMarkdownRenderer()
      const result = renderer.code({
        type: 'code',
        raw: '```mermaid\nA["B < C"] --> D\n```',
        text: 'A["B < C"] --> D',
        lang: 'mermaid',
        escaped: false,
      })

      expect(result).toContain('<')
    })
  })

  describe('renderMarkdownToHtml', () => {
    it('should render markdown to HTML', async () => {
      const { html } = await renderMarkdownToHtml('# Hello')
      expect(html).toContain('<h1>Hello</h1>')
    })

    it('should render mermaid blocks with special class', async () => {
      const { html } = await renderMarkdownToHtml('```mermaid\nflowchart TD\n```')
      expect(html).toContain('language-mermaid')
    })

    it('should render GFM features', async () => {
      const { html } = await renderMarkdownToHtml('- [x] Task 1')
      expect(html).toContain('checked')
    })

    it('should render line breaks', async () => {
      const { html } = await renderMarkdownToHtml('Line 1\nLine 2')
      expect(html).toContain('<br')
    })

    it('should render tables', async () => {
      const markdown = `| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |`
      const { html } = await renderMarkdownToHtml(markdown)
      expect(html).toContain('<table>')
      expect(html).toContain('<th>')
      expect(html).toContain('<td>')
    })

    it('should return math expressions map', async () => {
      const { mathExpressions } = await renderMarkdownToHtml('$x^2$')
      expect(mathExpressions).toBeDefined()
      expect(mathExpressions.size).toBe(1)
    })
  })

  describe('configureMarked', () => {
    it('should configure marked without errors', () => {
      expect(() => configureMarked()).not.toThrow()
    })
  })

  describe('math support', () => {
    it('should extract inline math expressions', async () => {
      const markdown = 'The equation $E = mc^2$ is famous.'
      const { html, mathExpressions } = await renderMarkdownToHtml(markdown)

      // Should contain the placeholder that gets converted to a span
      expect(html).toContain('math-inline')
      expect(mathExpressions.size).toBe(1)

      const firstMath = Array.from(mathExpressions.values())[0]
      expect(firstMath.type).toBe('inline')
      expect(firstMath.content).toBe('E = mc^2')
    })

    it('should extract display math expressions', async () => {
      const markdown = '$$\\int_{0}^{1} x^2 dx$$'
      const { html, mathExpressions } = await renderMarkdownToHtml(markdown)

      expect(html).toContain('math-display')
      expect(mathExpressions.size).toBe(1)

      const firstMath = Array.from(mathExpressions.values())[0]
      expect(firstMath.type).toBe('display')
      expect(firstMath.content).toContain('\\int')
    })

    it('should handle multiple math expressions', async () => {
      const markdown = 'Inline $a$ and display $$b$$ math.'
      const { mathExpressions } = await renderMarkdownToHtml(markdown)

      expect(mathExpressions.size).toBe(2)

      const expressions = Array.from(mathExpressions.values())
      const inlineExpr = expressions.find(e => e.type === 'inline')
      const displayExpr = expressions.find(e => e.type === 'display')

      expect(inlineExpr).toBeDefined()
      expect(inlineExpr!.content).toBe('a')
      expect(displayExpr).toBeDefined()
      expect(displayExpr!.content).toBe('b')
    })

    it('should preserve math expressions with special characters', async () => {
      const markdown = '$\\frac{a}{b}$ and $$\\sum_{i=1}^{n} i$$'
      const { mathExpressions } = await renderMarkdownToHtml(markdown)

      expect(mathExpressions.size).toBe(2)

      const expressions = Array.from(mathExpressions.values())
      const fracExpr = expressions.find(e => e.content.includes('\\frac'))
      const sumExpr = expressions.find(e => e.content.includes('\\sum'))

      expect(fracExpr).toBeDefined()
      expect(sumExpr).toBeDefined()
    })

    it('should not treat escaped dollars as math delimiters', async () => {
      const markdown = 'Price is \\$50'
      const { mathExpressions } = await renderMarkdownToHtml(markdown)

      // Should have no math expressions
      expect(mathExpressions.size).toBe(0)
    })

    it('should handle multiline display math', async () => {
      const markdown = `$$
      \\begin{bmatrix}
      a & b \\\\
      c & d
      \\end{bmatrix}
      $$`
      const { html, mathExpressions } = await renderMarkdownToHtml(markdown)

      expect(mathExpressions.size).toBe(1)
      expect(html).toContain('math-display')

      const firstMath = Array.from(mathExpressions.values())[0]
      expect(firstMath.type).toBe('display')
      expect(firstMath.content).toContain('\\begin{bmatrix}')
    })
  })

  describe('code block edge cases', () => {
    it('should handle code blocks containing backticks', async () => {
      const markdown = '```typescript\nconst str = "`\\`\\`";\n```'
      const { html } = await renderMarkdownToHtml(markdown)

      // The backticks inside the code should be preserved/escaped properly
      expect(html).toContain('language-typescript')
      // Check for the variable name in the highlighted output
      expect(html).toContain('str')
    })

    it('should handle code blocks with triple backticks inside', async () => {
      const markdown = `\`\`\`markdown
# Example
\`\`\`typescript
console.log("hello");
\`\`\`
\`\`\``
      const { html } = await renderMarkdownToHtml(markdown)

      expect(html).toContain('language-markdown')
      // Should contain the nested code fence
      expect(html).toContain('```typescript')
    })

    it('should escape backticks inside code blocks to prevent premature closing', async () => {
      // This tests the bug where backticks inside code weren't escaped
      // and would prematurely close the code block
      const markdown = `\`\`\`typescript
const example = "some \`\`\`text";
console.log(example);
\`\`\``
      const { html } = await renderMarkdownToHtml(markdown)

      // The entire code block should be parsed as one typescript block
      expect(html).toContain('language-typescript')
      // Both lines should be present - check for the specific content
      expect(html).toContain('example')
      expect(html).toContain('console')
      // The backticks inside the string should be preserved
      expect(html).toContain('```text')
    })

    it('should not treat $ inside code blocks as math delimiters', async () => {
      // This tests the bug where $ inside template literals in code blocks
      // would be treated as math delimiters
      const markdown = `\`\`\`typescript
function greetUser(user: User): string {
  return \`\`;
}
\`\`\`

Some text here.

The price is $5.00$ today.`
      const { html, mathExpressions } = await renderMarkdownToHtml(markdown)

      // The code block should be properly parsed as typescript
      expect(html).toContain('language-typescript')
      // Both lines should be present
      expect(html).toContain('greetUser')
      expect(html).toContain('return')

      // Should have exactly one math expression ($5.00$)
      expect(mathExpressions.size).toBe(1)
      const firstMath = Array.from(mathExpressions.values())[0]
      expect(firstMath.content).toBe('5.00')
    })

    it('should handle template literals with $ in code blocks', async () => {
      // Test the specific case: return `$`;
      const markdown = `\`\`\`typescript
return \`$\`;
\`\`\``
      const { html, mathExpressions } = await renderMarkdownToHtml(markdown)

      expect(html).toContain('language-typescript')
      expect(html).toContain('return')
      // No math expressions should be extracted
      expect(mathExpressions.size).toBe(0)
    })
  })
})
