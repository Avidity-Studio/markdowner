import { useState, useEffect } from 'react'
import { Monitor, Sun, Moon } from 'lucide-react'
import './ThemeToggle.css'

type Theme = 'system' | 'light' | 'dark'

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    // Get saved theme from localStorage or default to system
    return (localStorage.getItem('theme') as Theme) || 'system'
  })

  useEffect(() => {
    const root = document.documentElement
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)')

    const applyTheme = () => {
      root.classList.remove('light', 'dark')

      if (theme === 'system') {
        if (systemPrefersDark.matches) {
          root.classList.add('dark')
        } else {
          root.classList.add('light')
        }
      } else {
        root.classList.add(theme)
      }
    }

    applyTheme()
    localStorage.setItem('theme', theme)

    // Listen for system theme changes when in system mode
    const handleSystemChange = () => {
      if (theme === 'system') {
        applyTheme()
      }
    }

    systemPrefersDark.addEventListener('change', handleSystemChange)
    return () => systemPrefersDark.removeEventListener('change', handleSystemChange)
  }, [theme])

  const options: { value: Theme; icon: React.ReactNode; label: string }[] = [
    { value: 'system', icon: <Monitor size={16} />, label: 'System' },
    { value: 'light', icon: <Sun size={16} />, label: 'Light' },
    { value: 'dark', icon: <Moon size={16} />, label: 'Dark' },
  ]

  return (
    <div className="theme-toggle">
      {options.map(option => (
        <button
          key={option.value}
          className={`theme-toggle-btn ${theme === option.value ? 'active' : ''}`}
          onClick={() => setTheme(option.value)}
          title={option.label}
          aria-label={`Switch to ${option.label} mode`}
        >
          {option.icon}
        </button>
      ))}
    </div>
  )
}
