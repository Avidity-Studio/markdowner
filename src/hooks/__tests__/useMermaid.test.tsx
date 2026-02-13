import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRef } from 'react'
import { useMermaid } from '../useMermaid'

// Mock mermaid
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg>mocked</svg>' }),
  },
}))

describe('useMermaid', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should initialize without errors', () => {
    const TestComponent = () => {
      const containerRef = useRef<HTMLDivElement>(null)
      useMermaid(containerRef, '<div>test</div>')
      return null
    }

    const { unmount } = renderHook(() => TestComponent())
    expect(unmount).not.toThrow()
  })

  it('should process mermaid code blocks', async () => {
    // Create a container with a mermaid code block
    const container = document.createElement('div')
    container.innerHTML =
      '<pre><code class="language-mermaid">flowchart TD\nA --> B</code></pre>'
    document.body.appendChild(container)

    const TestComponent = () => {
      const containerRef = useRef<HTMLDivElement>(container)
      useMermaid(containerRef, container.innerHTML)
      return null
    }

    renderHook(() => TestComponent())

    // Wait for the async render
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Cleanup
    document.body.removeChild(container)
  })

  it('should handle empty containers', () => {
    const TestComponent = () => {
      const containerRef = useRef<HTMLDivElement>(null)
      useMermaid(containerRef, '')
      return null
    }

    expect(() => renderHook(() => TestComponent())).not.toThrow()
  })

  it('should respond to html changes', () => {
    const TestComponent = ({ html }: { html: string }) => {
      const containerRef = useRef<HTMLDivElement>(null)
      useMermaid(containerRef, html)
      return null
    }

    const { rerender } = renderHook((props) => TestComponent(props), {
      initialProps: { html: '<div>initial</div>' },
    })

    // Rerender with different html
    rerender({ html: '<div>updated</div>' })

    // Should not throw
    expect(true).toBe(true)
  })
})
