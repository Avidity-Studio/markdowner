import { useState, useCallback, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { listen } from '@tauri-apps/api/event'
import { useMermaid } from './hooks/useMermaid'
import { useMath } from './hooks/useMath'
import { renderMarkdownToHtml } from './utils/markdown'
import {
  FolderOpen,
  Save,
  FilePlus,
  Clock,
  X,
  Upload,
  AlertCircle,
  CheckCircle,
  Info,
  XCircle,
  PanelRight,
  PanelLeft,
  PanelTop,
  Search,
  ChevronDown,
  ChevronUp,
  CaseSensitive,
} from 'lucide-react'
import { ThemeToggle } from './components/ThemeToggle'
import './App.css'

// Toast notification types
type ToastType = 'error' | 'success' | 'info'

interface Toast {
  id: number
  message: string
  type: ToastType
}

function App() {
  const [markdown, setMarkdown] = useState<string>(
    '# Welcome to Markdown Editor\n\nStart typing your markdown here...\n\n## Features\n\n- **Live preview** - See your changes in real-time\n- **File operations** - Open and save markdown files\n- **Drag & drop** - Drop markdown files to open them\n- **Mermaid diagrams** - Render flowcharts and diagrams\n- **Math support** - LaTeX-style math expressions\n- **Syntax highlighting** - Code blocks with GitHub-style highlighting\n- **Clean interface** - Focus on your writing\n\n## Code Example\n\n```typescript\n// Example TypeScript code with syntax highlighting\ninterface User {\n  id: number;\n  name: string;\n  email: string;\n}\n\nfunction greetUser(user: User): string {\n  return `Hello, ${user.name}!`;\n}\n\nconst user: User = {\n  id: 1,\n  name: "Alice",\n  email: "alice@example.com"\n};\n\nconsole.log(greetUser(user));\n```\n\n## Math Expressions\n\nThis editor supports LaTeX-style math expressions using KaTeX.\n\n### Inline Math\nYou can write inline math like $E = mc^2$ or $\\frac{d}{dx}(x^2) = 2x$ right in your sentences.\n\n### Display Math\nFor more complex equations, use display math:\n\n$$\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}$$\n\n$$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$\n\n$$\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}$$\n\n## Mermaid Diagram Example\n\n```mermaid\nflowchart TD\n    A[Start] --> B{Is it working?}\n    B -->|Yes| C[Great!]\n    B -->|No| D[Debug]\n    D --> B\n    C --> E[Deploy]\n```\n\n> Tip: Use the toolbar buttons to open or save files, or drag and drop a markdown file onto the window!'
  )
  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [recentFiles, setRecentFiles] = useState<string[]>([])
  const [showRecents, setShowRecents] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  type ViewMode = 'markdown-only' | 'split' | 'preview-only'
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const recentsRef = useRef<HTMLDivElement>(null)
  const toastIdRef = useRef(0)

  // Search state
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [replaceQuery, setReplaceQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
  const [totalMatches, setTotalMatches] = useState(0)
  const [showReplace, setShowReplace] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Debounced markdown rendering with sanitization
  const [html, setHtml] = useState<string>('')
  const previewRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)

  // Synchronized scrolling state
  const isScrolling = useRef(false)
  const scrollTimeout = useRef<number | null>(null)

  useEffect(() => {
    const renderMarkdown = async () => {
      // Use our custom renderer with mermaid and math support
      // Pass search query and active match index to highlight matches in preview
      const { html: sanitizedHtml } = await renderMarkdownToHtml(
        markdown,
        showSearch ? searchQuery : '',
        caseSensitive,
        currentMatchIndex
      )
      setHtml(sanitizedHtml)
    }
    renderMarkdown()
  }, [markdown, showSearch, searchQuery, caseSensitive, currentMatchIndex])

  // Scroll active search highlight into view in preview
  useEffect(() => {
    if (showSearch && searchQuery && currentMatchIndex > 0) {
      // Use setTimeout to wait for the DOM to update after html changes
      setTimeout(() => {
        const preview = previewRef.current
        const activeHighlight = preview?.querySelector('#search-highlight-active')
        if (preview && activeHighlight) {
          // Calculate scroll position to center the highlight but stay within bounds
          const previewRect = preview.getBoundingClientRect()
          const highlightRect = activeHighlight.getBoundingClientRect()
          const relativeTop = highlightRect.top - previewRect.top + preview.scrollTop
          const targetScrollTop = relativeTop - preview.clientHeight / 2 + highlightRect.height / 2
          const maxScrollTop = preview.scrollHeight - preview.clientHeight
          preview.scrollTo({
            top: Math.max(0, Math.min(targetScrollTop, maxScrollTop)),
            behavior: 'smooth',
          })
        }
      }, 50)
    }
  }, [html, showSearch, searchQuery, currentMatchIndex])

  // Render mermaid diagrams after HTML is set
  useMermaid(previewRef, html)

  // Render math expressions after HTML is set
  useMath(previewRef, html)

  // Toast notification helper
  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++toastIdRef.current
    setToasts(prev => [...prev, { id, message, type }])
    // Auto-remove toast after 5 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 5000)
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  // Search functionality - helper to escape regex
  const escapeRegExp = (string: string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  // Navigate to a specific match position
  const navigateToMatch = useCallback((start: number, end: number, focus: boolean = true) => {
    if (!editorRef.current) return
    const editor = editorRef.current
    if (focus) {
      editor.focus()
    }
    editor.setSelectionRange(start, end)
    // Scroll into view
    const text = editor.value.substring(0, start)
    const lines = text.split('\n')
    const lineHeight = 24 // Approximate line height
    const scrollPosition = (lines.length - 1) * lineHeight
    // Center the match, but clamp to valid scroll bounds to avoid white space at bottom
    const maxScrollTop = editor.scrollHeight - editor.clientHeight
    const targetScrollTop = scrollPosition - editor.clientHeight / 2
    editor.scrollTop = Math.max(0, Math.min(targetScrollTop, maxScrollTop))
  }, [])

  // Find all matches in the document
  const findMatches = useCallback(() => {
    if (!searchQuery || !editorRef.current) return 0

    const editor = editorRef.current
    const text = editor.value
    const flags = caseSensitive ? 'g' : 'gi'
    const regex = new RegExp(escapeRegExp(searchQuery), flags)

    const matches: { start: number; end: number }[] = []
    let match
    while ((match = regex.exec(text)) !== null) {
      matches.push({ start: match.index, end: match.index + match[0].length })
      // Prevent infinite loop on zero-width matches
      if (match[0].length === 0) regex.lastIndex++
    }

    setTotalMatches(matches.length)
    if (matches.length > 0) {
      setCurrentMatchIndex(1)
      // Scroll to first match (don't focus editor while typing in search box)
      navigateToMatch(matches[0].start, matches[0].end, false)
    } else {
      setCurrentMatchIndex(0)
    }

    return matches.length
  }, [searchQuery, caseSensitive, navigateToMatch])

  const goToNextMatch = useCallback(() => {
    if (!editorRef.current || totalMatches === 0) return
    const editor = editorRef.current
    const text = editor.value
    const flags = caseSensitive ? 'g' : 'gi'
    const regex = new RegExp(escapeRegExp(searchQuery), flags)

    const matches: { start: number; end: number }[] = []
    let match
    while ((match = regex.exec(text)) !== null) {
      matches.push({ start: match.index, end: match.index + match[0].length })
      if (match[0].length === 0) regex.lastIndex++
    }

    const nextIndex = currentMatchIndex >= matches.length ? 1 : currentMatchIndex + 1
    setCurrentMatchIndex(nextIndex)
    if (matches[nextIndex - 1]) {
      navigateToMatch(matches[nextIndex - 1].start, matches[nextIndex - 1].end, true)
    }
  }, [searchQuery, caseSensitive, totalMatches, currentMatchIndex, navigateToMatch])

  const goToPreviousMatch = useCallback(() => {
    if (!editorRef.current || totalMatches === 0) return
    const editor = editorRef.current
    const text = editor.value
    const flags = caseSensitive ? 'g' : 'gi'
    const regex = new RegExp(escapeRegExp(searchQuery), flags)

    const matches: { start: number; end: number }[] = []
    let match
    while ((match = regex.exec(text)) !== null) {
      matches.push({ start: match.index, end: match.index + match[0].length })
      if (match[0].length === 0) regex.lastIndex++
    }

    const prevIndex = currentMatchIndex <= 1 ? matches.length : currentMatchIndex - 1
    setCurrentMatchIndex(prevIndex)
    if (matches[prevIndex - 1]) {
      navigateToMatch(matches[prevIndex - 1].start, matches[prevIndex - 1].end, true)
    }
  }, [searchQuery, caseSensitive, totalMatches, currentMatchIndex, navigateToMatch])

  const replaceCurrent = useCallback(() => {
    if (!editorRef.current || totalMatches === 0) return
    const editor = editorRef.current
    const start = editor.selectionStart
    const end = editor.selectionEnd
    const selectedText = editor.value.substring(start, end)

    const flags = caseSensitive ? 'g' : 'gi'
    const regex = new RegExp(`^${escapeRegExp(searchQuery)}$`, flags)

    if (regex.test(selectedText)) {
      const newValue = editor.value.substring(0, start) + replaceQuery + editor.value.substring(end)
      setMarkdown(newValue)
      setIsDirty(true)
      // After replacement, find next match
      setTimeout(() => {
        findMatches()
      }, 0)
    }
  }, [searchQuery, replaceQuery, caseSensitive, totalMatches, findMatches])

  const replaceAll = useCallback(() => {
    if (!editorRef.current || !searchQuery) return
    const editor = editorRef.current
    const flags = caseSensitive ? 'g' : 'gi'
    const regex = new RegExp(escapeRegExp(searchQuery), flags)
    const newValue = editor.value.replace(regex, replaceQuery)
    setMarkdown(newValue)
    setIsDirty(true)
    setTotalMatches(0)
    setCurrentMatchIndex(0)
  }, [searchQuery, replaceQuery, caseSensitive])

  const closeSearch = useCallback(() => {
    setShowSearch(false)
    setShowReplace(false)
    setSearchQuery('')
    setReplaceQuery('')
    setTotalMatches(0)
    setCurrentMatchIndex(0)
    // Only focus editor if not in preview-only mode
    if (viewMode !== 'preview-only') {
      editorRef.current?.focus()
    }
  }, [viewMode])

  // Effect to find matches when search query or case sensitivity changes
  useEffect(() => {
    if (showSearch && searchQuery) {
      findMatches()
    }
  }, [showSearch, searchQuery, caseSensitive, findMatches])

  // Keyboard shortcut for search (Ctrl/Cmd + F)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + F to open search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        setShowSearch(true)
        setTimeout(() => searchInputRef.current?.focus(), 0)
      }
      // Escape to close search
      if (e.key === 'Escape' && showSearch) {
        closeSearch()
      }
      // Enter to go to next match
      if (e.key === 'Enter' && showSearch && !e.shiftKey) {
        e.preventDefault()
        if (showReplace && document.activeElement === searchInputRef.current) {
          goToNextMatch()
        } else if (!showReplace) {
          goToNextMatch()
        }
      }
      // Shift + Enter to go to previous match
      if (e.key === 'Enter' && showSearch && e.shiftKey) {
        e.preventDefault()
        goToPreviousMatch()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showSearch, showReplace, goToNextMatch, goToPreviousMatch, closeSearch])

  // Load recent files on mount and check for pending file (opened via file association)
  useEffect(() => {
    loadRecentFiles()
  }, [])

  // Close recents dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (recentsRef.current && !recentsRef.current.contains(event.target as Node)) {
        setShowRecents(false)
      }
    }

    if (showRecents) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showRecents])

  const loadRecentFiles = async () => {
    try {
      const files = await invoke<string[]>('get_recent_files')
      setRecentFiles(files)
    } catch (error) {
      console.error('Failed to load recent files:', error)
    }
  }

  const handleNewFile = useCallback(() => {
    setMarkdown('# New Document\n\nStart writing here...')
    setCurrentFile(null)
    setIsDirty(false)
    showToast('New document created', 'success')
  }, [showToast])

  const handleOpenFile = useCallback(async () => {
    try {
      const filePath = await invoke<string | null>('open_file_dialog')
      if (filePath) {
        const content = await invoke<string>('read_file', { path: filePath })
        setMarkdown(content)
        setCurrentFile(filePath)
        setIsDirty(false)
        loadRecentFiles()
        showToast(`Opened: ${filePath.split('/').pop()}`, 'success')
      }
    } catch (error) {
      console.error('Failed to open file:', error)
      showToast(`Failed to open file: ${error}`, 'error')
    }
  }, [showToast])

  const handleOpenRecentFile = useCallback(
    async (filePath: string) => {
      try {
        const content = await invoke<string>('read_file', { path: filePath })
        setMarkdown(content)
        setCurrentFile(filePath)
        setIsDirty(false)
        // Add to recents and reload the list
        await invoke('add_to_recents', { path: filePath })
        loadRecentFiles()
        setShowRecents(false)
        showToast(`Opened: ${filePath.split('/').pop()}`, 'success')
      } catch (error) {
        console.error('Failed to open file:', error)
        showToast(`Failed to open file: ${error}`, 'error')
        // Remove from recents if file no longer exists or is inaccessible
        if (String(error).includes('does not exist') || String(error).includes('not readable')) {
          loadRecentFiles() // Refresh list which will filter out invalid files
        }
      }
    },
    [showToast]
  )

  // Check for pending file (when app is opened via file association)
  // This is in a separate useEffect to ensure handleOpenRecentFile is up to date
  useEffect(() => {
    const checkPendingFile = async () => {
      try {
        const pendingFile = await invoke<string | null>('get_pending_file')
        if (pendingFile) {
          console.log('Pending file found:', pendingFile)
          // Validate it's a markdown file
          const isMarkdown =
            pendingFile.toLowerCase().endsWith('.md') ||
            pendingFile.toLowerCase().endsWith('.markdown') ||
            pendingFile.toLowerCase().endsWith('.mdx')

          if (isMarkdown) {
            await handleOpenRecentFile(pendingFile)
          } else {
            showToast('Please open a markdown file (.md, .markdown, or .mdx)', 'error')
          }
        }
      } catch (error) {
        console.error('Failed to check for pending file:', error)
      }
    }

    // Small delay to ensure the app is fully initialized
    const timer = setTimeout(() => {
      checkPendingFile()
    }, 100)

    return () => clearTimeout(timer)
  }, [handleOpenRecentFile, showToast])

  const handleSaveFile = useCallback(async () => {
    try {
      let filePath = currentFile
      if (!filePath) {
        filePath = await invoke<string | null>('save_file_dialog')
      }
      if (filePath) {
        await invoke('write_file', { path: filePath, content: markdown })
        setCurrentFile(filePath)
        setIsDirty(false)
        loadRecentFiles()
        showToast(`Saved: ${filePath.split('/').pop()}`, 'success')
      }
    } catch (error) {
      console.error('Failed to save file:', error)
      showToast(`Failed to save file: ${error}`, 'error')
    }
  }, [currentFile, markdown, showToast])

  const handleSaveAsFile = useCallback(async () => {
    try {
      const filePath = await invoke<string | null>('save_file_dialog')
      if (filePath) {
        await invoke('write_file', { path: filePath, content: markdown })
        setCurrentFile(filePath)
        setIsDirty(false)
        loadRecentFiles()
        showToast(`Saved: ${filePath.split('/').pop()}`, 'success')
      }
    } catch (error) {
      console.error('Failed to save file:', error)
      showToast(`Failed to save file: ${error}`, 'error')
    }
  }, [markdown, showToast])

  const handleClearRecents = useCallback(async () => {
    try {
      await invoke('clear_recent_files')
      setRecentFiles([])
      showToast('Recent files cleared', 'info')
    } catch (error) {
      console.error('Failed to clear recent files:', error)
      showToast(`Failed to clear recent files: ${error}`, 'error')
    }
  }, [showToast])

  const handleMarkdownChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMarkdown(e.target.value)
    setIsDirty(true)
  }, [])

  // Synchronized scroll handler
  const syncScroll = useCallback((source: 'editor' | 'preview') => {
    if (isScrolling.current) return
    isScrolling.current = true

    const editor = editorRef.current
    const preview = previewRef.current
    if (!editor || !preview) {
      isScrolling.current = false
      return
    }

    if (source === 'editor') {
      // Calculate scroll percentage for editor
      const editorScrollHeight = editor.scrollHeight - editor.clientHeight
      const editorScrollPercent = editorScrollHeight > 0 ? editor.scrollTop / editorScrollHeight : 0

      // Apply to preview
      const previewScrollHeight = preview.scrollHeight - preview.clientHeight
      preview.scrollTop = editorScrollPercent * previewScrollHeight
    } else {
      // Calculate scroll percentage for preview
      const previewScrollHeight = preview.scrollHeight - preview.clientHeight
      const previewScrollPercent =
        previewScrollHeight > 0 ? preview.scrollTop / previewScrollHeight : 0

      // Apply to editor
      const editorScrollHeight = editor.scrollHeight - editor.clientHeight
      editor.scrollTop = previewScrollPercent * editorScrollHeight
    }

    // Clear scrolling flag after a short delay
    if (scrollTimeout.current) {
      window.clearTimeout(scrollTimeout.current)
    }
    scrollTimeout.current = window.setTimeout(() => {
      isScrolling.current = false
    }, 50)
  }, [])

  // Handle editor scroll
  const handleEditorScroll = useCallback(() => {
    syncScroll('editor')
  }, [syncScroll])

  // Handle preview scroll
  const handlePreviewScroll = useCallback(() => {
    syncScroll('preview')
  }, [syncScroll])

  // Cleanup scroll timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeout.current) {
        window.clearTimeout(scrollTimeout.current)
      }
    }
  }, [])

  const getFileName = (path: string) => {
    return path.split('/').pop() || path
  }

  // Tauri native drag and drop handlers
  const handleTauriDrop = useCallback(
    async (paths: string[]) => {
      if (paths && paths.length > 0) {
        const filePath = paths[0]

        // Check if file is a markdown file
        const isMarkdown =
          filePath.toLowerCase().endsWith('.md') ||
          filePath.toLowerCase().endsWith('.markdown') ||
          filePath.toLowerCase().endsWith('.mdx')

        if (!isMarkdown) {
          showToast('Please drop a markdown file (.md, .markdown, or .mdx)', 'error')
          return
        }

        try {
          const content = await invoke<string>('read_file', { path: filePath })
          setMarkdown(content)
          setCurrentFile(filePath)
          setIsDirty(false)
          loadRecentFiles()
          showToast(`Opened: ${filePath.split('/').pop()}`, 'success')
        } catch (error) {
          console.error('Failed to open file:', error)
          showToast(`Failed to open file: ${error}`, 'error')
        }
      }
    },
    [showToast]
  )

  // Set up Tauri drag-drop event listeners
  useEffect(() => {
    const appWindow = getCurrentWindow()

    const unlistenDragEnter = appWindow.onDragDropEvent(event => {
      if (event.payload.type === 'enter') {
        setIsDragging(true)
      } else if (event.payload.type === 'leave') {
        setIsDragging(false)
      } else if (event.payload.type === 'drop') {
        setIsDragging(false)
        handleTauriDrop(event.payload.paths)
      }
    })

    return () => {
      unlistenDragEnter.then(fn => fn())
    }
  }, [handleTauriDrop])

  // Set up dock drag-drop event listener (macOS)
  useEffect(() => {
    // Listen for dock-open-file event from Rust
    const unlistenDockFile = listen<string>('dock-open-file', event => {
      console.log('Received dock-open-file event:', event.payload)
      const filePath = event.payload
      if (filePath) {
        // Validate it's a markdown file
        const isMarkdown =
          filePath.toLowerCase().endsWith('.md') ||
          filePath.toLowerCase().endsWith('.markdown') ||
          filePath.toLowerCase().endsWith('.mdx')

        if (isMarkdown) {
          handleOpenRecentFile(filePath)
        } else {
          showToast('Please open a markdown file (.md, .markdown, or .mdx)', 'error')
        }
      }
    })

    return () => {
      unlistenDockFile.then(fn => fn())
    }
  }, [handleOpenRecentFile, showToast])

  // Deep-link events are handled by the Rust backend which emits 'dock-open-file'
  // The backend properly decodes file:// URLs including percent-encoded characters
  // See src-tauri/src/lib.rs for the deep-link handling logic

  // Set up menu event listeners
  useEffect(() => {
    // Listen for menu events from the native menu bar
    const unlistenNewFile = listen<void>('menu-new-file', () => {
      handleNewFile()
    })

    const unlistenOpenFile = listen<void>('menu-open-file', () => {
      handleOpenFile()
    })

    const unlistenSaveFile = listen<void>('menu-save-file', () => {
      handleSaveFile()
    })

    const unlistenSaveAsFile = listen<void>('menu-save-as-file', () => {
      handleSaveAsFile()
    })

    return () => {
      unlistenNewFile.then(fn => fn())
      unlistenOpenFile.then(fn => fn())
      unlistenSaveFile.then(fn => fn())
      unlistenSaveAsFile.then(fn => fn())
    }
  }, [handleNewFile, handleOpenFile, handleSaveFile, handleSaveAsFile])

  // HTML5 drag and drop handlers for visual feedback
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    // Prevent default to allow the Tauri native event to handle it
    e.preventDefault()
    e.stopPropagation()
  }, [])

  // Get toast icon based on type
  const getToastIcon = (type: ToastType) => {
    switch (type) {
      case 'error':
        return <AlertCircle size={20} />
      case 'success':
        return <CheckCircle size={20} />
      case 'info':
        return <Info size={20} />
    }
  }

  return (
    <div
      className="app-container"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`toast toast-${toast.type}`}
            onClick={() => removeToast(toast.id)}
          >
            {getToastIcon(toast.type)}
            <span className="toast-message">{toast.message}</span>
            <XCircle size={16} className="toast-close" />
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-left">
          <h1 className="app-title">Markdown Editor</h1>
          {currentFile && (
            <span className="file-path">
              {currentFile.split('/').pop()}
              {isDirty && ' *'}
            </span>
          )}
        </div>
        <div className="toolbar-actions">
          <ThemeToggle />
          <div className="toolbar-divider" />

          {/* Search Button */}
          <button
            onClick={() => {
              setShowSearch(true)
              setTimeout(() => searchInputRef.current?.focus(), 0)
            }}
            className="btn btn-secondary"
            title="Find (Ctrl/Cmd + F)"
          >
            <Search size={18} />
            <span>Find</span>
          </button>

          <div className="toolbar-divider" />

          {/* View Mode Toggle Group */}
          <div className="view-mode-toggle">
            <button
              onClick={() => setViewMode('markdown-only')}
              className={`view-mode-btn ${viewMode === 'markdown-only' ? 'active' : ''}`}
              title="Markdown Only"
              aria-label="Switch to Markdown Only view"
            >
              <PanelLeft size={16} />
            </button>
            <button
              onClick={() => setViewMode('split')}
              className={`view-mode-btn ${viewMode === 'split' ? 'active' : ''}`}
              title="Split View"
              aria-label="Switch to Split view"
            >
              <PanelTop size={16} />
            </button>
            <button
              onClick={() => setViewMode('preview-only')}
              className={`view-mode-btn ${viewMode === 'preview-only' ? 'active' : ''}`}
              title="Preview Only"
              aria-label="Switch to Preview Only view"
            >
              <PanelRight size={16} />
            </button>
          </div>

          <div className="toolbar-divider" />

          {/* Recents Dropdown */}
          <div className="recents-dropdown" ref={recentsRef}>
            <button
              onClick={() => setShowRecents(!showRecents)}
              className="btn btn-secondary"
              title="Recent Files"
            >
              <Clock size={18} />
              <span>Recents</span>
            </button>
            {showRecents && (
              <div className="recents-menu">
                {recentFiles.length === 0 ? (
                  <div className="recents-empty">No recent files</div>
                ) : (
                  <>
                    <div className="recents-list">
                      {recentFiles.map((file, index) => (
                        <button
                          key={index}
                          className="recents-item"
                          onClick={() => handleOpenRecentFile(file)}
                          title={file}
                        >
                          <span className="recents-item-name">{getFileName(file)}</span>
                          <span className="recents-item-path">{file}</span>
                        </button>
                      ))}
                    </div>
                    <div className="recents-footer">
                      <button className="recents-clear" onClick={handleClearRecents}>
                        <X size={14} />
                        Clear Recents
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <button onClick={handleNewFile} className="btn btn-secondary" title="New File">
            <FilePlus size={18} />
            <span>New</span>
          </button>
          <button onClick={handleOpenFile} className="btn btn-secondary" title="Open File">
            <FolderOpen size={18} />
            <span>Open</span>
          </button>
          <button onClick={handleSaveFile} className="btn btn-primary" title="Save File">
            <Save size={18} />
            <span>Save</span>
          </button>
        </div>
      </div>

      {/* Search Panel */}
      {showSearch && (
        <div className="search-panel">
          <div className="search-row">
            <div className="search-input-wrapper">
              <Search size={16} className="search-icon" />
              <input
                ref={searchInputRef}
                type="text"
                className="search-input"
                placeholder="Find..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {totalMatches > 0 && (
                <span className="match-counter">
                  {currentMatchIndex} / {totalMatches}
                </span>
              )}
            </div>
            <button
              className={`btn-search-option ${caseSensitive ? 'active' : ''}`}
              onClick={() => setCaseSensitive(!caseSensitive)}
              title="Case Sensitive"
            >
              <CaseSensitive size={16} />
            </button>
            <button
              className="btn-search-nav"
              onClick={goToPreviousMatch}
              disabled={totalMatches === 0}
              title="Previous Match (Shift+Enter)"
            >
              <ChevronUp size={18} />
            </button>
            <button
              className="btn-search-nav"
              onClick={goToNextMatch}
              disabled={totalMatches === 0}
              title="Next Match (Enter)"
            >
              <ChevronDown size={18} />
            </button>
            <button className="btn-search-close" onClick={closeSearch} title="Close (Esc)">
              <X size={18} />
            </button>
          </div>
          {showReplace && (
            <div className="replace-row">
              <input
                type="text"
                className="replace-input"
                placeholder="Replace with..."
                value={replaceQuery}
                onChange={e => setReplaceQuery(e.target.value)}
              />
              <button
                className="btn-replace"
                onClick={replaceCurrent}
                disabled={totalMatches === 0}
              >
                Replace
              </button>
              <button
                className="btn-replace-all"
                onClick={replaceAll}
                disabled={totalMatches === 0 || !searchQuery}
              >
                Replace All
              </button>
            </div>
          )}
          <div className="search-options">
            <button className="btn-toggle-replace" onClick={() => setShowReplace(!showReplace)}>
              {showReplace ? 'Hide Replace' : 'Show Replace'}
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className={`editor-container ${viewMode}`}>
        {/* Editor Pane - always rendered but hidden in preview-only mode for search to work */}
        <div className="editor-pane">
          <div className="pane-header">Markdown</div>
          <textarea
            ref={editorRef}
            className="markdown-input"
            value={markdown}
            onChange={handleMarkdownChange}
            onScroll={handleEditorScroll}
            placeholder="Type your markdown here..."
            spellCheck={false}
          />
        </div>

        {/* Preview Pane */}
        <div className="preview-pane">
          <div className="pane-header">Preview</div>
          <div
            ref={previewRef}
            className="markdown-preview"
            onScroll={handlePreviewScroll}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>

      {/* Status Bar */}
      <div className="status-bar">
        <span>{markdown.length} characters</span>
        <span>{markdown.split(/\s+/).filter(w => w.length > 0).length} words</span>
        <span>{isDirty ? 'Unsaved' : 'Saved'}</span>
      </div>

      {/* Drag and Drop Overlay */}
      {isDragging && (
        <div className="drag-overlay">
          <div className="drag-overlay-content">
            <Upload size={64} />
            <p>Drop markdown file to open</p>
            <span className="drag-overlay-hint">.md, .markdown, .mdx</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
