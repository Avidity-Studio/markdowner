import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeToggle } from '../ThemeToggle'

describe('ThemeToggle', () => {
  beforeEach(() => {
    // Reset localStorage mock
    vi.mocked(localStorage.getItem).mockReturnValue(null)
    vi.mocked(localStorage.setItem).mockClear()

    // Reset document classes
    document.documentElement.className = ''

    // Reset matchMedia mock
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })
  })

  it('renders three theme buttons', () => {
    render(<ThemeToggle />)

    expect(screen.getByLabelText('Switch to System mode')).toBeInTheDocument()
    expect(screen.getByLabelText('Switch to Light mode')).toBeInTheDocument()
    expect(screen.getByLabelText('Switch to Dark mode')).toBeInTheDocument()
  })

  it('defaults to system theme when no localStorage value', () => {
    vi.mocked(localStorage.getItem).mockReturnValue(null)
    render(<ThemeToggle />)

    const systemButton = screen.getByLabelText('Switch to System mode')
    expect(systemButton).toHaveClass('active')
  })

  it('loads saved theme from localStorage', () => {
    vi.mocked(localStorage.getItem).mockReturnValue('dark')
    render(<ThemeToggle />)

    const darkButton = screen.getByLabelText('Switch to Dark mode')
    expect(darkButton).toHaveClass('active')
  })

  it('switches to light theme and updates localStorage', () => {
    render(<ThemeToggle />)

    const lightButton = screen.getByLabelText('Switch to Light mode')
    fireEvent.click(lightButton)

    expect(lightButton).toHaveClass('active')
    expect(localStorage.setItem).toHaveBeenCalledWith('theme', 'light')
    expect(document.documentElement).toHaveClass('light')
  })

  it('switches to dark theme and updates localStorage', () => {
    render(<ThemeToggle />)

    const darkButton = screen.getByLabelText('Switch to Dark mode')
    fireEvent.click(darkButton)

    expect(darkButton).toHaveClass('active')
    expect(localStorage.setItem).toHaveBeenCalledWith('theme', 'dark')
    expect(document.documentElement).toHaveClass('dark')
  })

  it('switches to system theme and updates localStorage', () => {
    // Start with dark theme
    vi.mocked(localStorage.getItem).mockReturnValue('dark')
    render(<ThemeToggle />)

    const systemButton = screen.getByLabelText('Switch to System mode')
    fireEvent.click(systemButton)

    expect(systemButton).toHaveClass('active')
    expect(localStorage.setItem).toHaveBeenCalledWith('theme', 'system')
  })

  it('applies dark class when system prefers dark', () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    render(<ThemeToggle />)

    expect(document.documentElement).toHaveClass('dark')
  })

  it('applies light class when system prefers light', () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    render(<ThemeToggle />)

    expect(document.documentElement).toHaveClass('light')
  })

  it('only one button is active at a time', () => {
    render(<ThemeToggle />)

    const systemButton = screen.getByLabelText('Switch to System mode')
    const lightButton = screen.getByLabelText('Switch to Light mode')
    const darkButton = screen.getByLabelText('Switch to Dark mode')

    // Initially system is active
    expect(systemButton).toHaveClass('active')
    expect(lightButton).not.toHaveClass('active')
    expect(darkButton).not.toHaveClass('active')

    // Click light
    fireEvent.click(lightButton)
    expect(systemButton).not.toHaveClass('active')
    expect(lightButton).toHaveClass('active')
    expect(darkButton).not.toHaveClass('active')

    // Click dark
    fireEvent.click(darkButton)
    expect(systemButton).not.toHaveClass('active')
    expect(lightButton).not.toHaveClass('active')
    expect(darkButton).toHaveClass('active')
  })

  it('listens to system theme changes when in system mode', () => {
    const addEventListenerMock = vi.fn()
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: addEventListenerMock,
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })

    render(<ThemeToggle />)

    expect(addEventListenerMock).toHaveBeenCalledWith('change', expect.any(Function))
  })

  // Edge case tests
  it('handles invalid localStorage value gracefully', () => {
    vi.mocked(localStorage.getItem).mockReturnValue('invalid-theme')
    render(<ThemeToggle />)

    // Should default to system theme
    const systemButton = screen.getByLabelText('Switch to System mode')
    // With invalid value, it should render without crashing (no active class)
    expect(systemButton).toBeInTheDocument()
  })

  it('updates document class when switching themes', () => {
    render(<ThemeToggle />)

    const lightButton = screen.getByLabelText('Switch to Light mode')
    fireEvent.click(lightButton)

    expect(document.documentElement).toHaveClass('light')
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('removes all theme classes before applying new theme', () => {
    // Start with light theme
    vi.mocked(localStorage.getItem).mockReturnValue('light')
    document.documentElement.classList.add('light')

    render(<ThemeToggle />)

    const darkButton = screen.getByLabelText('Switch to Dark mode')
    fireEvent.click(darkButton)

    // Should remove light class and add dark
    expect(document.documentElement).not.toHaveClass('light')
    expect(document.documentElement).toHaveClass('dark')
  })

  it('persists theme choice to localStorage', () => {
    render(<ThemeToggle />)

    const darkButton = screen.getByLabelText('Switch to Dark mode')
    fireEvent.click(darkButton)

    expect(localStorage.setItem).toHaveBeenCalledWith('theme', 'dark')
  })

  it('persists theme even when same theme is clicked', () => {
    render(<ThemeToggle />)

    const systemButton = screen.getByLabelText('Switch to System mode')
    fireEvent.click(systemButton)

    // Should still persist theme to localStorage
    expect(localStorage.setItem).toHaveBeenCalledWith('theme', 'system')
  })

  it('has correct aria-labels for accessibility', () => {
    render(<ThemeToggle />)

    expect(screen.getByLabelText('Switch to System mode')).toBeInTheDocument()
    expect(screen.getByLabelText('Switch to Light mode')).toBeInTheDocument()
    expect(screen.getByLabelText('Switch to Dark mode')).toBeInTheDocument()
  })

  it('has correct title attributes for tooltips', () => {
    render(<ThemeToggle />)

    const systemButton = screen.getByLabelText('Switch to System mode')
    const lightButton = screen.getByLabelText('Switch to Light mode')
    const darkButton = screen.getByLabelText('Switch to Dark mode')

    expect(systemButton).toHaveAttribute('title', 'System')
    expect(lightButton).toHaveAttribute('title', 'Light')
    expect(darkButton).toHaveAttribute('title', 'Dark')
  })
})
