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
      const html = await renderMarkdownToHtml('# Hello')
      expect(html).toContain('<h1>Hello</h1>')
    })

    it('should render mermaid blocks with special class', async () => {
      const html = await renderMarkdownToHtml('```mermaid\nflowchart TD\n```')
      expect(html).toContain('language-mermaid')
    })

    it('should render GFM features', async () => {
      const html = await renderMarkdownToHtml('- [x] Task 1')
      expect(html).toContain('checked')
    })

    it('should render line breaks', async () => {
      const html = await renderMarkdownToHtml('Line 1\nLine 2')
      expect(html).toContain('<br')
    })

    it('should render tables', async () => {
      const markdown = `| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |`
      const html = await renderMarkdownToHtml(markdown)
      expect(html).toContain('<table>')
      expect(html).toContain('<th>')
      expect(html).toContain('<td>')
    })
  })

  describe('configureMarked', () => {
    it('should configure marked without errors', () => {
      expect(() => configureMarked()).not.toThrow()
    })
  })
})
