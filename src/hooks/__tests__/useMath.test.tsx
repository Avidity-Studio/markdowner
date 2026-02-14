import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useRef } from 'react'
import { useMath } from '../useMath'
import katex from 'katex'

// Mock katex
vi.mock('katex', () => ({
  default: {
    renderToString: vi.fn((content: string, options: { displayMode?: boolean }) => {
      return options?.displayMode
        ? `<div class="katex-display">${content}</div>`
        : `<span class="katex">${content}</span>`
    }),
  },
}))

describe('useMath hook', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    container.id = 'test-container'
    document.body.appendChild(container)
    vi.clearAllMocks()
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  it('should render inline math expressions', async () => {
    // Create inline math element in container
    const inlineMath = document.createElement('span')
    inlineMath.className = 'math-inline'
    inlineMath.setAttribute('data-math', encodeURIComponent('x^2'))
    container.appendChild(inlineMath)

    // Render hook with a proper ref callback that sets the container
    renderHook(() => {
      const ref = useRef<HTMLDivElement>(container)
      useMath(ref, 'test-html')
      return ref
    })

    // Wait for useEffect to run with requestAnimationFrame
    await waitFor(() => {
      expect(katex.renderToString).toHaveBeenCalledWith('x^2', {
        throwOnError: false,
        displayMode: false,
      })
    })

    // Verify the element was updated
    expect(inlineMath.innerHTML).toContain('x^2')
    expect(inlineMath.getAttribute('data-math-rendered')).toBe('true')
  })

  it('should render display math expressions', async () => {
    // Create display math element
    const displayMath = document.createElement('div')
    displayMath.className = 'math-display'
    displayMath.setAttribute('data-math', encodeURIComponent('\\int_0^1 x^2 dx'))
    container.appendChild(displayMath)

    renderHook(() => {
      const ref = useRef<HTMLDivElement>(container)
      useMath(ref, 'test-html')
    })

    // Wait for useEffect to run
    await waitFor(() => {
      expect(katex.renderToString).toHaveBeenCalledWith('\\int_0^1 x^2 dx', {
        throwOnError: false,
        displayMode: true,
      })
    })

    // Verify the element was updated
    expect(displayMath.innerHTML).toContain('\\int_0^1 x^2 dx')
    expect(displayMath.getAttribute('data-math-rendered')).toBe('true')
  })

  it('should handle multiple math expressions', async () => {
    // Create multiple math elements
    const math1 = document.createElement('span')
    math1.className = 'math-inline'
    math1.setAttribute('data-math', encodeURIComponent('a'))

    const math2 = document.createElement('div')
    math2.className = 'math-display'
    math2.setAttribute('data-math', encodeURIComponent('b'))

    container.appendChild(math1)
    container.appendChild(math2)

    renderHook(() => {
      const ref = useRef<HTMLDivElement>(container)
      useMath(ref, 'test-html')
    })

    // Wait for useEffect to run
    await waitFor(() => {
      expect(katex.renderToString).toHaveBeenCalledTimes(2)
    })

    // Verify both elements were marked as rendered
    expect(math1.getAttribute('data-math-rendered')).toBe('true')
    expect(math2.getAttribute('data-math-rendered')).toBe('true')
  })

  it('should not re-render already processed elements', async () => {
    // Create an already rendered math element
    const mathEl = document.createElement('span')
    mathEl.className = 'math-inline'
    mathEl.setAttribute('data-math', encodeURIComponent('x'))
    mathEl.setAttribute('data-math-rendered', 'true')
    container.appendChild(mathEl)

    renderHook(() => {
      const ref = useRef<HTMLDivElement>(container)
      useMath(ref, 'test-html')
    })

    // Wait a tick for any async operations
    await new Promise(resolve => setTimeout(resolve, 50))

    // katex.renderToString should not be called for already rendered elements
    expect(katex.renderToString).not.toHaveBeenCalled()
  })

  it('should handle math rendering errors gracefully', async () => {
    // Make katex throw an error
    vi.mocked(katex.renderToString).mockImplementationOnce(() => {
      throw new Error('Invalid math')
    })

    const mathEl = document.createElement('span')
    mathEl.className = 'math-inline'
    mathEl.setAttribute('data-math', encodeURIComponent('invalid math'))
    container.appendChild(mathEl)

    renderHook(() => {
      const ref = useRef<HTMLDivElement>(container)
      useMath(ref, 'test-html')
    })

    // Wait for useEffect to run
    await waitFor(() => {
      expect(mathEl.getAttribute('data-math-rendered')).toBe('true')
    })

    // Should show original text wrapped in $ on error
    expect(mathEl.textContent).toContain('invalid math')
    expect(mathEl.classList.contains('math-error')).toBe(true)
  })

  it('should handle HTML changes by clearing and re-rendering', async () => {
    // First render with one math element
    const math1 = document.createElement('span')
    math1.className = 'math-inline'
    math1.setAttribute('data-math', encodeURIComponent('first'))
    container.appendChild(math1)

    const { rerender } = renderHook(
      ({ html }) => {
        const ref = useRef<HTMLDivElement>(container)
        useMath(ref, html)
        return ref
      },
      { initialProps: { html: 'initial' } }
    )

    // Wait for first render
    await waitFor(() => {
      expect(katex.renderToString).toHaveBeenCalledWith('first', {
        throwOnError: false,
        displayMode: false,
      })
    })

    // Clear mocks and add a new math element
    vi.clearAllMocks()

    // Simulate a new math element being added (as if HTML changed)
    const math2 = document.createElement('span')
    math2.className = 'math-inline'
    math2.setAttribute('data-math', encodeURIComponent('second'))
    container.appendChild(math2)

    // Rerender with new HTML
    rerender({ html: 'updated' })

    // Wait for the new element to be rendered
    await waitFor(() => {
      expect(katex.renderToString).toHaveBeenCalledWith('second', {
        throwOnError: false,
        displayMode: false,
      })
    })
  })

  it('should skip elements without data-math attribute', async () => {
    const mathEl = document.createElement('span')
    mathEl.className = 'math-inline'
    // No data-math attribute
    container.appendChild(mathEl)

    renderHook(() => {
      const ref = useRef<HTMLDivElement>(container)
      useMath(ref, 'test-html')
    })

    // Wait a tick
    await new Promise(resolve => setTimeout(resolve, 50))

    // katex.renderToString should not be called
    expect(katex.renderToString).not.toHaveBeenCalled()
  })

  it('should handle null container ref gracefully', async () => {
    // Render with a null ref (container doesn't exist yet)
    renderHook(() => {
      const ref = useRef<HTMLDivElement>(null)
      useMath(ref, 'test-html')
    })

    // Wait a tick
    await new Promise(resolve => setTimeout(resolve, 50))

    // Should not throw and katex should not be called
    expect(katex.renderToString).not.toHaveBeenCalled()
  })
})
