import { useEffect, useRef, useCallback } from 'react'
import mermaid from 'mermaid'

// Initialize mermaid with default config
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'strict',
  suppressErrorRendering: true,
})

/**
 * Get the current theme based on document class or system preference
 */
function getCurrentMermaidTheme(): 'default' | 'dark' {
  const root = document.documentElement
  // Check if dark mode is active (either via manual toggle or system preference)
  const isDark =
    root.classList.contains('dark') ||
    (!root.classList.contains('light') && window.matchMedia('(prefers-color-scheme: dark)').matches)
  return isDark ? 'dark' : 'default'
}

/**
 * Hook to render mermaid diagrams in the given container
 * @param containerRef - Ref to the container element containing mermaid code blocks
 * @param html - The HTML content (triggers re-render when changed)
 */
export function useMermaid(containerRef: React.RefObject<HTMLElement | null>, html: string) {
  const processedRef = useRef<Set<string>>(new Set())
  const currentThemeRef = useRef<string>(getCurrentMermaidTheme())

  const renderMermaidDiagrams = useCallback(async () => {
    if (!containerRef.current) return

    // Check if theme changed and update mermaid config
    const newTheme = getCurrentMermaidTheme()
    if (currentThemeRef.current !== newTheme) {
      mermaid.initialize({ theme: newTheme })
      currentThemeRef.current = newTheme
      // Clear processed set to force re-render with new theme
      processedRef.current.clear()
    }

    // Find all mermaid code blocks that haven't been processed yet
    const mermaidBlocks = containerRef.current.querySelectorAll('pre code.language-mermaid')

    for (const block of mermaidBlocks) {
      const code = block.textContent || ''
      // Create a unique ID for this diagram based on content hash
      const id = `mermaid-${hashString(code)}`

      // Skip if already processed
      if (processedRef.current.has(id)) continue

      const pre = block.parentElement
      if (!pre) continue

      try {
        // Render the mermaid diagram first (before modifying DOM)
        const { svg } = await mermaid.render(`${id}-svg`, code)

        // Only replace the pre element if rendering succeeded
        const container = document.createElement('div')
        container.id = id
        container.className = 'mermaid-container'
        container.innerHTML = svg

        // Replace the pre element with the container
        pre.parentElement?.replaceChild(container, pre)

        // Mark as processed
        processedRef.current.add(id)
      } catch (error) {
        console.error('Failed to render mermaid diagram:', error)
        // Keep the original code block on error and add error class
        pre.classList.add('mermaid-error')
      }
    }
  }, [containerRef])

  // Reset processed set when HTML changes significantly
  useEffect(() => {
    processedRef.current.clear()
  }, [html])

  // Render diagrams after HTML is set
  useEffect(() => {
    renderMermaidDiagrams()
  }, [html, renderMermaidDiagrams])

  // Watch for theme changes (both system preference and manual toggle)
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const root = document.documentElement

    const handleThemeChange = () => {
      // Clear processed set to re-render with new theme
      processedRef.current.clear()
      renderMermaidDiagrams()
    }

    // Listen for system theme changes
    mediaQuery.addEventListener('change', handleThemeChange)

    // Observe class changes on root element for manual theme toggle
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          handleThemeChange()
        }
      }
    })

    observer.observe(root, { attributes: true, attributeFilter: ['class'] })

    return () => {
      mediaQuery.removeEventListener('change', handleThemeChange)
      observer.disconnect()
    }
  }, [renderMermaidDiagrams])
}

/**
 * Simple hash function for strings
 */
function hashString(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36)
}
