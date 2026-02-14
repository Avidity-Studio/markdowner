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
  const [showPreviewOnly, setShowPreviewOnly] = useState(false)
  const recentsRef = useRef<HTMLDivElement>(null)
  const toastIdRef = useRef(0)

  // Debounced markdown rendering with sanitization
  const [html, setHtml] = useState<string>('')
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const renderMarkdown = async () => {
      // Use our custom renderer with mermaid and math support
      const { html: sanitizedHtml } = await renderMarkdownToHtml(markdown)
      setHtml(sanitizedHtml)
    }
    renderMarkdown()
  }, [markdown])

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

          {/* Toggle Preview Only Mode */}
          <button
            onClick={() => setShowPreviewOnly(!showPreviewOnly)}
            className="btn btn-secondary"
            title={showPreviewOnly ? 'Show Editor' : 'Preview Only'}
          >
            {showPreviewOnly ? <PanelLeft size={18} /> : <PanelRight size={18} />}
            <span>{showPreviewOnly ? 'Show Editor' : 'Preview Only'}</span>
          </button>

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

      {/* Main Content */}
      <div className={`editor-container ${showPreviewOnly ? 'preview-only' : ''}`}>
        {/* Editor Pane */}
        {!showPreviewOnly && (
          <div className="editor-pane">
            <div className="pane-header">Markdown</div>
            <textarea
              className="markdown-input"
              value={markdown}
              onChange={handleMarkdownChange}
              placeholder="Type your markdown here..."
              spellCheck={false}
            />
          </div>
        )}

        {/* Preview Pane */}
        <div className="preview-pane">
          <div className="pane-header">Preview</div>
          <div
            ref={previewRef}
            className="markdown-preview"
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
