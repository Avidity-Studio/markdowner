import { useEffect, useRef, useCallback } from 'react'
import katex from 'katex'

/**
 * Hook to render math expressions using KaTeX in the given container
 * @param containerRef - Ref to the container element containing math placeholders
 * @param html - The HTML content (triggers re-render when changed)
 */
export function useMath(
  containerRef: React.RefObject<HTMLElement | null>,
  html: string
) {
  const processedRef = useRef<Set<HTMLElement>>(new Set())

  const renderMath = useCallback(() => {
    if (!containerRef.current) return

    // Find all unprocessed math placeholders
    const mathInlineElements = containerRef.current.querySelectorAll('.math-inline:not([data-math-rendered])')
    const mathDisplayElements = containerRef.current.querySelectorAll('.math-display:not([data-math-rendered])')

    // Render inline math
    for (const element of mathInlineElements) {
      const mathContent = element.getAttribute('data-math')
      if (!mathContent) continue

      try {
        const decodedContent = decodeURIComponent(mathContent)
        const rendered = katex.renderToString(decodedContent, {
          throwOnError: false,
          displayMode: false,
        })
        element.innerHTML = rendered
        element.setAttribute('data-math-rendered', 'true')
        processedRef.current.add(element as HTMLElement)
      } catch (error) {
        console.error('Failed to render inline math:', error)
        element.textContent = `$${decodeURIComponent(mathContent)}$`
        element.setAttribute('data-math-rendered', 'true')
        element.classList.add('math-error')
      }
    }

    // Render display math
    for (const element of mathDisplayElements) {
      const mathContent = element.getAttribute('data-math')
      if (!mathContent) continue

      try {
        const decodedContent = decodeURIComponent(mathContent)
        const rendered = katex.renderToString(decodedContent, {
          throwOnError: false,
          displayMode: true,
        })
        element.innerHTML = rendered
        element.setAttribute('data-math-rendered', 'true')
        processedRef.current.add(element as HTMLElement)
      } catch (error) {
        console.error('Failed to render display math:', error)
        element.textContent = `$$${decodeURIComponent(mathContent)}$$`
        element.setAttribute('data-math-rendered', 'true')
        element.classList.add('math-error')
      }
    }
  }, [containerRef])

  // Reset processed set when HTML changes
  useEffect(() => {
    processedRef.current.clear()
  }, [html])

  // Render math after HTML is set
  useEffect(() => {
    // Use requestAnimationFrame to ensure DOM is ready
    const frameId = requestAnimationFrame(() => {
      renderMath()
    })
    return () => cancelAnimationFrame(frameId)
  }, [html, renderMath])
}
