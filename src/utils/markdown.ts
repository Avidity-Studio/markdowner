import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'

// Import common languages for syntax highlighting
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import csharp from 'highlight.js/lib/languages/csharp'
import cpp from 'highlight.js/lib/languages/cpp'
import c from 'highlight.js/lib/languages/c'
import ruby from 'highlight.js/lib/languages/ruby'
import php from 'highlight.js/lib/languages/php'
import shell from 'highlight.js/lib/languages/shell'
import bash from 'highlight.js/lib/languages/bash'
import sql from 'highlight.js/lib/languages/sql'
import yaml from 'highlight.js/lib/languages/yaml'
import json from 'highlight.js/lib/languages/json'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import scss from 'highlight.js/lib/languages/scss'
import markdown from 'highlight.js/lib/languages/markdown'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import graphql from 'highlight.js/lib/languages/graphql'

// Register languages
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('go', go)
hljs.registerLanguage('java', java)
hljs.registerLanguage('csharp', csharp)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('c', c)
hljs.registerLanguage('ruby', ruby)
hljs.registerLanguage('php', php)
hljs.registerLanguage('shell', shell)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('yml', yaml)
hljs.registerLanguage('json', json)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('css', css)
hljs.registerLanguage('scss', scss)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('md', markdown)
hljs.registerLanguage('dockerfile', dockerfile)
hljs.registerLanguage('graphql', graphql)
hljs.registerLanguage('gql', graphql)

// Math placeholder prefix for escaping math during markdown parsing
const MATH_INLINE_PREFIX = 'MATH_INLINE_PLACEHOLDER_'
const MATH_DISPLAY_PREFIX = 'MATH_DISPLAY_PLACEHOLDER_'

/**
 * Extract and replace math expressions with placeholders
 * Returns the processed text and the extracted math expressions
 */
function extractMathExpressions(text: string): {
  text: string
  mathExpressions: Map<string, { type: 'inline' | 'display'; content: string }>
} {
  const mathExpressions = new Map<string, { type: 'inline' | 'display'; content: string }>()
  let counter = 0
  let processedText = text

  // First, extract display math ($$...$$) - must be done before inline
  // Display math can span multiple lines, so use [\s\S]
  processedText = processedText.replace(/\$\$([\s\S]*?)\$\$/g, (_, content) => {
    const placeholder = `${MATH_DISPLAY_PREFIX}${counter++}`
    mathExpressions.set(placeholder, { type: 'display', content: content.trim() })
    return placeholder
  })

  // Then, extract inline math ($...$)
  // Inline math should NOT span multiple lines - use [^\n] instead of [\s\S]
  // This prevents matching math expressions that cross code block boundaries
  // Negative lookbehind to avoid matching escaped dollars
  processedText = processedText.replace(/(?<!\\)\$([^\s$][^$\n]*?)\$/g, (_, content) => {
    const placeholder = `${MATH_INLINE_PREFIX}${counter++}`
    mathExpressions.set(placeholder, { type: 'inline', content: content.trim() })
    return placeholder
  })

  return { text: processedText, mathExpressions }
}

// Extend marked renderer to handle mermaid code blocks specially
export function createMarkdownRenderer() {
  const renderer = new marked.Renderer()

  // Override code renderer to handle mermaid blocks and syntax highlighting
  renderer.code = function ({ text, lang, escaped }) {
    if (lang === 'mermaid') {
      // Return a placeholder that will be replaced by the mermaid hook
      // Use a code element with a special class so we can find it later
      return `<pre><code class="language-mermaid">${escapeHtml(text)}</code></pre>`
    }

    // For non-mermaid code, apply syntax highlighting
    if (lang && hljs.getLanguage(lang)) {
      try {
        const highlighted = hljs.highlight(text, { language: lang }).value
        return `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>`
      } catch (e) {
        // Fall through to non-highlighted rendering
      }
    }

    // Default rendering without highlighting
    const langClass = lang ? ` class="language-${lang}"` : ''
    return `<pre><code${langClass}>${escaped ? text : escapeHtml(text)}</code></pre>`
  }

  return renderer
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Highlight search matches in HTML text
 * Wraps matching text in <mark> elements with search-highlight class
 * The active match (at activeMatchIndex) gets the search-highlight-active class
 */
function highlightSearchInHtml(
  html: string,
  searchQuery: string,
  caseSensitive: boolean,
  activeMatchIndex: number = 0
): string {
  if (!searchQuery) return html

  const flags = caseSensitive ? 'g' : 'gi'
  const escapedQuery = escapeRegExp(searchQuery)
  const regex = new RegExp(`(${escapedQuery})`, flags)

  // Create a temporary div to parse the HTML
  const div = document.createElement('div')
  div.innerHTML = html

  // Track match index across all text nodes
  let matchCounter = 0

  // Recursively process text nodes to add highlighting
  const highlightTextNodes = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || ''
      const matches: Array<{ start: number; end: number }> = []
      let match

      // Find all matches in this text node
      while ((match = regex.exec(text)) !== null) {
        matches.push({ start: match.index, end: match.index + match[0].length })
        if (match[0].length === 0) regex.lastIndex++
      }

      if (matches.length > 0) {
        // Reset regex for next node
        regex.lastIndex = 0

        // Build fragment with highlighted matches
        const fragment = document.createDocumentFragment()
        let lastEnd = 0

        matches.forEach(({ start, end }) => {
          // Add text before match
          if (start > lastEnd) {
            fragment.appendChild(document.createTextNode(text.substring(lastEnd, start)))
          }

          // Add highlighted match
          matchCounter++
          const mark = document.createElement('mark')
          mark.className = 'search-highlight'
          if (matchCounter === activeMatchIndex) {
            mark.classList.add('search-highlight-active')
            mark.id = 'search-highlight-active'
          }
          mark.textContent = text.substring(start, end)
          fragment.appendChild(mark)

          lastEnd = end
        })

        // Add remaining text after last match
        if (lastEnd < text.length) {
          fragment.appendChild(document.createTextNode(text.substring(lastEnd)))
        }

        node.parentNode?.replaceChild(fragment, node)
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // Skip highlighting inside certain elements
      const el = node as Element
      const tagName = el.tagName.toLowerCase()
      if (tagName === 'code' || tagName === 'pre' || tagName === 'script' || tagName === 'style') {
        return
      }

      // Process child nodes (create a copy to avoid mutation issues)
      Array.from(node.childNodes).forEach(highlightTextNodes)
    }
  }

  Array.from(div.childNodes).forEach(highlightTextNodes)

  return div.innerHTML
}

/**
 * Render markdown to sanitized HTML with mermaid support and syntax highlighting
 * Also returns extracted math expressions for separate rendering
 */
export async function renderMarkdownToHtml(
  markdown: string,
  searchQuery?: string,
  caseSensitive: boolean = false,
  activeMatchIndex: number = 0
): Promise<{
  html: string
  mathExpressions: Map<string, { type: 'inline' | 'display'; content: string }>
}> {
  // Extract math expressions before parsing markdown
  const { text: textWithoutMath, mathExpressions } = extractMathExpressions(markdown)

  const renderer = createMarkdownRenderer()

  marked.use({ renderer })

  const rawHtml = await marked.parse(textWithoutMath, {
    gfm: true,
    breaks: true,
  })

  // Replace math placeholders with span elements that can be targeted
  let processedHtml = rawHtml
  mathExpressions.forEach((data, placeholder) => {
    const className = data.type === 'display' ? 'math-display' : 'math-inline'
    const spanElement = `<span class="${className}" data-math="${encodeURIComponent(data.content)}"></span>`
    processedHtml = processedHtml.replace(new RegExp(placeholder, 'g'), spanElement)
  })

  // Apply search highlighting if query is provided
  if (searchQuery) {
    processedHtml = highlightSearchInHtml(processedHtml, searchQuery, caseSensitive, activeMatchIndex)
  }

  const html = DOMPurify.sanitize(processedHtml, {
    ADD_TAGS: ['span', 'mark'],
    ADD_ATTR: ['class', 'data-math', 'id'],
  })

  return { html, mathExpressions }
}

/**
 * Configure marked with the custom renderer
 * Call this once at app initialization
 */
export function configureMarked() {
  const renderer = createMarkdownRenderer()

  marked.use({ renderer })
}
