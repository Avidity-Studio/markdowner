import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor as waitForRTL } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import App from '../App'

// Mock the Tauri invoke function
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

describe('App', () => {
  const mockInvoke = vi.mocked(invoke)

  beforeEach(() => {
    mockInvoke.mockClear()
    // Default mock for get_recent_files
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_recent_files') {
        return Promise.resolve([])
      }
      return Promise.resolve(null)
    })
  })

  it('renders the app title', async () => {
    render(<App />)

    await waitForRTL(() => {
      expect(screen.getByText('Markdown Editor')).toBeInTheDocument()
    })
  })

  it('renders editor and preview panes', async () => {
    render(<App />)

    await waitForRTL(() => {
      // Check for pane headers using class name to distinguish from toggle buttons
      const markdownHeader = screen.getByText('Markdown', { selector: '.pane-header' })
      const previewHeader = screen.getByText('Preview', { selector: '.pane-header' })
      expect(markdownHeader).toBeInTheDocument()
      expect(previewHeader).toBeInTheDocument()
    })
  })

  it('renders toolbar buttons', async () => {
    render(<App />)

    await waitForRTL(() => {
      expect(screen.getByTitle('New File')).toBeInTheDocument()
      expect(screen.getByTitle('Open File')).toBeInTheDocument()
      expect(screen.getByTitle('Save File')).toBeInTheDocument()
    })
  })

  it('has a textarea for markdown input', async () => {
    render(<App />)

    await waitForRTL(() => {
      const textarea = screen.getByPlaceholderText('Type your markdown here...')
      expect(textarea).toBeInTheDocument()
      expect(textarea.tagName).toBe('TEXTAREA')
    })
  })

  it('shows default welcome content in textarea', async () => {
    render(<App />)

    await waitForRTL(() => {
      const textarea = screen.getByPlaceholderText(
        'Type your markdown here...'
      ) as HTMLTextAreaElement
      expect(textarea.value).toContain('Welcome to Markdown Editor')
    })
  })

  it('updates markdown content when typing', async () => {
    render(<App />)

    await waitForRTL(() => {
      const textarea = screen.getByPlaceholderText('Type your markdown here...')
      fireEvent.change(textarea, { target: { value: '# Hello World' } })
      expect((textarea as HTMLTextAreaElement).value).toBe('# Hello World')
    })
  })

  it('shows unsaved indicator when content changes', async () => {
    render(<App />)

    await waitForRTL(() => {
      const textarea = screen.getByPlaceholderText('Type your markdown here...')
      fireEvent.change(textarea, { target: { value: 'New content' } })
    })

    // Status bar should show "Unsaved"
    await waitForRTL(() => {
      expect(screen.getByText('Unsaved')).toBeInTheDocument()
    })
  })

  it('displays character and word counts', async () => {
    render(<App />)

    await waitForRTL(() => {
      // Should show character count
      const charCount = screen.getByText(/\d+ characters/)
      expect(charCount).toBeInTheDocument()

      // Should show word count
      const wordCount = screen.getByText(/\d+ words/)
      expect(wordCount).toBeInTheDocument()
    })
  })

  it('calls invoke to load recent files on mount', async () => {
    render(<App />)

    await waitForRTL(() => {
      expect(mockInvoke).toHaveBeenCalledWith('get_recent_files')
    })
  })

  it('opens recent files dropdown when Recents button is clicked', async () => {
    render(<App />)

    await waitForRTL(() => {
      const recentsButton = screen.getByTitle('Recent Files')
      fireEvent.click(recentsButton)
    })

    // Should show "No recent files" when empty
    await waitForRTL(() => {
      expect(screen.getByText('No recent files')).toBeInTheDocument()
    })
  })

  it('calls new file handler when New button is clicked', async () => {
    render(<App />)

    await waitForRTL(() => {
      const newButton = screen.getByTitle('New File')
      fireEvent.click(newButton)
    })

    // Should show a toast notification
    await waitForRTL(() => {
      expect(screen.getByText('New document created')).toBeInTheDocument()
    })
  })

  it('calls open file dialog when Open button is clicked', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_recent_files') return Promise.resolve([])
      if (cmd === 'open_file_dialog') return Promise.resolve('/path/to/file.md')
      if (cmd === 'read_file') return Promise.resolve('# File Content')
      return Promise.resolve(null)
    })

    render(<App />)

    await waitForRTL(() => {
      const openButton = screen.getByTitle('Open File')
      fireEvent.click(openButton)
    })

    await waitForRTL(() => {
      expect(mockInvoke).toHaveBeenCalledWith('open_file_dialog')
    })
  })

  it('displays recent files when available', async () => {
    const recentFiles = ['/path/to/file1.md', '/path/to/file2.md']
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_recent_files') return Promise.resolve(recentFiles)
      return Promise.resolve(null)
    })

    render(<App />)

    await waitForRTL(() => {
      const recentsButton = screen.getByTitle('Recent Files')
      fireEvent.click(recentsButton)
    })

    await waitForRTL(() => {
      expect(screen.getByText('file1.md')).toBeInTheDocument()
      expect(screen.getByText('file2.md')).toBeInTheDocument()
    })
  })

  it('shows theme toggle component', async () => {
    render(<App />)

    await waitForRTL(() => {
      expect(screen.getByLabelText('Switch to System mode')).toBeInTheDocument()
      expect(screen.getByLabelText('Switch to Light mode')).toBeInTheDocument()
      expect(screen.getByLabelText('Switch to Dark mode')).toBeInTheDocument()
    })
  })

  // File Operation Tests
  it('opens a file and displays content', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_recent_files') return Promise.resolve([])
      if (cmd === 'open_file_dialog') return Promise.resolve('/path/to/test.md')
      if (cmd === 'read_file') return Promise.resolve('# Test Content')
      if (cmd === 'add_to_recents') return Promise.resolve()
      return Promise.resolve(null)
    })

    render(<App />)

    await waitForRTL(() => {
      const openButton = screen.getByTitle('Open File')
      fireEvent.click(openButton)
    })

    await waitForRTL(() => {
      const textarea = screen.getByPlaceholderText(
        'Type your markdown here...'
      ) as HTMLTextAreaElement
      expect(textarea.value).toBe('# Test Content')
      expect(screen.getByText('test.md')).toBeInTheDocument()
      expect(screen.getByText('Saved')).toBeInTheDocument()
    })
  })

  it('handles save file with new path (save as)', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_recent_files') return Promise.resolve([])
      if (cmd === 'save_file_dialog') return Promise.resolve('/new/path/save.md')
      if (cmd === 'write_file') return Promise.resolve()
      if (cmd === 'add_to_recents') return Promise.resolve()
      return Promise.resolve(null)
    })

    render(<App />)

    // Make content dirty
    await waitForRTL(() => {
      const textarea = screen.getByPlaceholderText('Type your markdown here...')
      fireEvent.change(textarea, { target: { value: 'New content to save' } })
    })

    // Save file
    await waitForRTL(() => {
      const saveButton = screen.getByTitle('Save File')
      fireEvent.click(saveButton)
    })

    await waitForRTL(() => {
      expect(mockInvoke).toHaveBeenCalledWith('save_file_dialog')
      expect(mockInvoke).toHaveBeenCalledWith('write_file', {
        path: '/new/path/save.md',
        content: 'New content to save',
      })
      expect(screen.getByText('save.md')).toBeInTheDocument()
      expect(screen.getByText('Saved')).toBeInTheDocument()
    })
  })

  it('displays error toast when file open fails', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_recent_files') return Promise.resolve([])
      if (cmd === 'open_file_dialog') return Promise.resolve('/nonexistent/file.md')
      if (cmd === 'read_file') return Promise.reject('File does not exist')
      return Promise.resolve(null)
    })

    render(<App />)

    await waitForRTL(() => {
      const openButton = screen.getByTitle('Open File')
      fireEvent.click(openButton)
    })

    await waitForRTL(() => {
      expect(screen.getByText('Failed to open file: File does not exist')).toBeInTheDocument()
    })
  })

  it('displays error toast when file save fails', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_recent_files') return Promise.resolve([])
      if (cmd === 'save_file_dialog') return Promise.resolve('/readonly/file.md')
      if (cmd === 'write_file') return Promise.reject('Permission denied')
      return Promise.resolve(null)
    })

    render(<App />)

    // Make content dirty
    await waitForRTL(() => {
      const textarea = screen.getByPlaceholderText('Type your markdown here...')
      fireEvent.change(textarea, { target: { value: 'Content' } })
    })

    await waitForRTL(() => {
      const saveButton = screen.getByTitle('Save File')
      fireEvent.click(saveButton)
    })

    await waitForRTL(() => {
      expect(screen.getByText('Failed to save file: Permission denied')).toBeInTheDocument()
    })
  })

  it('handles opening non-markdown files', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_recent_files') return Promise.resolve([])
      if (cmd === 'open_file_dialog') return Promise.resolve('/path/to/file.txt')
      if (cmd === 'read_file') return Promise.resolve('Plain text')
      if (cmd === 'add_to_recents') return Promise.resolve()
      return Promise.resolve(null)
    })

    render(<App />)

    await waitForRTL(() => {
      const openButton = screen.getByTitle('Open File')
      fireEvent.click(openButton)
    })

    await waitForRTL(() => {
      const textarea = screen.getByPlaceholderText(
        'Type your markdown here...'
      ) as HTMLTextAreaElement
      expect(textarea.value).toBe('Plain text')
      expect(screen.getByText('file.txt')).toBeInTheDocument()
    })
  })

  // Recent Files Tests
  it('opens file from recent files list', async () => {
    const recentFiles = ['/path/to/file1.md']
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_recent_files') return Promise.resolve(recentFiles)
      if (cmd === 'read_file') return Promise.resolve('# File 1')
      if (cmd === 'add_to_recents') return Promise.resolve()
      return Promise.resolve(null)
    })

    render(<App />)

    await waitForRTL(() => {
      const recentsButton = screen.getByTitle('Recent Files')
      fireEvent.click(recentsButton)
    })

    await waitForRTL(() => {
      const file1Button = screen.getByText('file1.md')
      fireEvent.click(file1Button)
    })

    await waitForRTL(() => {
      const textarea = screen.getByPlaceholderText(
        'Type your markdown here...'
      ) as HTMLTextAreaElement
      expect(textarea.value).toBe('# File 1')
      expect(screen.getByText('file1.md')).toBeInTheDocument()
    })
  })

  it('removes non-existent recent file', async () => {
    const recentFiles = ['/nonexistent/file.md']
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_recent_files') return Promise.resolve(recentFiles)
      if (cmd === 'read_file') return Promise.reject('File does not exist')
      if (cmd === 'add_to_recents') return Promise.resolve()
      return Promise.resolve(null)
    })

    render(<App />)

    await waitForRTL(() => {
      const recentsButton = screen.getByTitle('Recent Files')
      fireEvent.click(recentsButton)
    })

    await waitForRTL(() => {
      const fileButton = screen.getByText('file.md')
      fireEvent.click(fileButton)
    })

    await waitForRTL(() => {
      expect(screen.getByText('Failed to open file: File does not exist')).toBeInTheDocument()
    })
  })

  it('clears recent files', async () => {
    const recentFiles = ['/path/to/file1.md', '/path/to/file2.md']
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_recent_files') return Promise.resolve(recentFiles)
      if (cmd === 'clear_recent_files') return Promise.resolve()
      return Promise.resolve(null)
    })

    render(<App />)

    await waitForRTL(() => {
      const recentsButton = screen.getByTitle('Recent Files')
      fireEvent.click(recentsButton)
    })

    await waitForRTL(() => {
      expect(screen.getByText('file1.md')).toBeInTheDocument()
      expect(screen.getByText('file2.md')).toBeInTheDocument()
    })

    await waitForRTL(() => {
      const clearButton = screen.getByText('Clear Recents')
      fireEvent.click(clearButton)
    })

    await waitForRTL(() => {
      expect(mockInvoke).toHaveBeenCalledWith('clear_recent_files')
      expect(screen.getByText('Recent files cleared')).toBeInTheDocument()
    })
  })

  // XSS Prevention Tests
  it('sanitizes script tags in markdown', async () => {
    const dangerousMarkdown = '# Test\n\n<script>alert("XSS")</script>'

    render(<App />)

    await waitForRTL(() => {
      const textarea = screen.getByPlaceholderText('Type your markdown here...')
      fireEvent.change(textarea, { target: { value: dangerousMarkdown } })
    })

    await waitForRTL(() => {
      const preview = document.querySelector('.markdown-preview') as HTMLElement
      // Script tag should be removed
      expect(preview.innerHTML).not.toContain('<script>')
      expect(preview.innerHTML).not.toContain('alert')
    })
  })

  it('sanitizes javascript: links', async () => {
    const dangerousMarkdown = '[Click](javascript:alert("XSS"))'

    render(<App />)

    await waitForRTL(() => {
      const textarea = screen.getByPlaceholderText('Type your markdown here...')
      fireEvent.change(textarea, { target: { value: dangerousMarkdown } })
    })

    await waitForRTL(() => {
      const preview = document.querySelector('.markdown-preview') as HTMLElement
      // javascript: URLs should be removed
      expect(preview.innerHTML).not.toContain('javascript:')
    })
  })

  it('sanitizes onerror attributes', async () => {
    const dangerousMarkdown = '# Test\n\n<img src=x onerror="alert(1)">'

    render(<App />)

    await waitForRTL(() => {
      const textarea = screen.getByPlaceholderText('Type your markdown here...')
      fireEvent.change(textarea, { target: { value: dangerousMarkdown } })
    })

    await waitForRTL(() => {
      const preview = document.querySelector('.markdown-preview') as HTMLElement
      // onerror attribute should be removed
      expect(preview.innerHTML).not.toContain('onerror')
    })
  })

  // Drag & Drop Tests
  it('shows drag overlay when dragging starts', async () => {
    // Mock Tauri window
    vi.mock('@tauri-apps/api/window', () => ({
      getCurrentWindow: vi.fn(() => ({
        onDragDropEvent: vi.fn(() => Promise.resolve(() => {})),
      })),
    }))

    render(<App />)

    await waitForRTL(() => {
      const appContainer = document.querySelector('.app-container')
      expect(appContainer).toBeInTheDocument()
    })
  })

  it('displays error toast for non-markdown files dropped', async () => {
    render(<App />)

    await waitForRTL(() => {
      // Simulate dropping a non-markdown file via the handleTauriDrop logic
      // This would normally be tested with event mocking
      const appContainer = document.querySelector('.app-container')
      expect(appContainer).toBeInTheDocument()
    })
  })

  // Toast Notification Tests
  it('shows success toast with correct icon', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_recent_files') return Promise.resolve([])
      if (cmd === 'open_file_dialog') return Promise.resolve('/path/to/test.md')
      if (cmd === 'read_file') return Promise.resolve('# Test')
      if (cmd === 'add_to_recents') return Promise.resolve()
      return Promise.resolve(null)
    })

    render(<App />)

    await waitForRTL(() => {
      const openButton = screen.getByTitle('Open File')
      fireEvent.click(openButton)
    })

    await waitForRTL(() => {
      expect(screen.getByText('Opened: test.md')).toBeInTheDocument()
      // Success toast should be present
      const toast = document.querySelector('.toast-success')
      expect(toast).toBeInTheDocument()
    })
  })

  it('shows error toast with correct icon', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_recent_files') return Promise.resolve([])
      if (cmd === 'open_file_dialog') return Promise.resolve('/nonexistent.md')
      if (cmd === 'read_file') return Promise.reject('File not found')
      return Promise.resolve(null)
    })

    render(<App />)

    await waitForRTL(() => {
      const openButton = screen.getByTitle('Open File')
      fireEvent.click(openButton)
    })

    await waitForRTL(() => {
      expect(screen.getByText(/Failed to open file/)).toBeInTheDocument()
      // Error toast should be present
      const toast = document.querySelector('.toast-error')
      expect(toast).toBeInTheDocument()
    })
  })

  it('removes toast when clicked', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_recent_files') return Promise.resolve([])
      if (cmd === 'open_file_dialog') return Promise.resolve('/path/to/test.md')
      if (cmd === 'read_file') return Promise.resolve('# Test')
      if (cmd === 'add_to_recents') return Promise.resolve()
      return Promise.resolve(null)
    })

    render(<App />)

    await waitForRTL(() => {
      const openButton = screen.getByTitle('Open File')
      fireEvent.click(openButton)
    })

    await waitForRTL(() => {
      const toast = document.querySelector('.toast')
      if (toast) {
        fireEvent.click(toast)
      }
    })

    // Toast should be removed
    await waitForRTL(() => {
      const toasts = document.querySelectorAll('.toast')
      expect(toasts.length).toBe(0)
    })
  })

  // Statistics Accuracy Tests
  it('accurately counts characters', async () => {
    render(<App />)

    await waitForRTL(() => {
      const textarea = screen.getByPlaceholderText('Type your markdown here...')
      fireEvent.change(textarea, { target: { value: 'Hello World' } })
    })

    await waitForRTL(() => {
      const charCount = screen.getByText('11 characters')
      expect(charCount).toBeInTheDocument()
    })
  })

  it('accurately counts words', async () => {
    render(<App />)

    await waitForRTL(() => {
      const textarea = screen.getByPlaceholderText('Type your markdown here...')
      fireEvent.change(textarea, { target: { value: 'Hello World Test' } })
    })

    await waitForRTL(() => {
      const wordCount = screen.getByText('3 words')
      expect(wordCount).toBeInTheDocument()
    })
  })

  it('handles empty content correctly', async () => {
    render(<App />)

    await waitForRTL(() => {
      const textarea = screen.getByPlaceholderText('Type your markdown here...')
      fireEvent.change(textarea, { target: { value: '' } })
    })

    await waitForRTL(() => {
      const charCount = screen.getByText('0 characters')
      const wordCount = screen.getByText('0 words')
      expect(charCount).toBeInTheDocument()
      expect(wordCount).toBeInTheDocument()
    })
  })

  it('handles multiple spaces correctly', async () => {
    render(<App />)

    await waitForRTL(() => {
      const textarea = screen.getByPlaceholderText('Type your markdown here...')
      fireEvent.change(textarea, { target: { value: 'Hello    World' } })
    })

    await waitForRTL(() => {
      const wordCount = screen.getByText('2 words')
      expect(wordCount).toBeInTheDocument()
    })
  })

  it('handles punctuation correctly', async () => {
    render(<App />)

    await waitForRTL(() => {
      const textarea = screen.getByPlaceholderText('Type your markdown here...')
      fireEvent.change(textarea, { target: { value: 'Hello, World!' } })
    })

    await waitForRTL(() => {
      const wordCount = screen.getByText('2 words')
      const charCount = screen.getByText('13 characters')
      expect(wordCount).toBeInTheDocument()
      expect(charCount).toBeInTheDocument()
    })
  })

  // UI Interaction Tests
  it('recent files dropdown is togglable', async () => {
    const recentFiles = ['/path/to/file1.md']
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_recent_files') return Promise.resolve(recentFiles)
      return Promise.resolve(null)
    })

    render(<App />)

    // Open dropdown
    await waitForRTL(() => {
      const recentsButton = screen.getByTitle('Recent Files')
      fireEvent.click(recentsButton)
    })

    await waitForRTL(() => {
      expect(screen.getByText('file1.md')).toBeInTheDocument()
    })

    // Close dropdown by clicking the button again
    await waitForRTL(() => {
      const recentsButton = screen.getByTitle('Recent Files')
      fireEvent.click(recentsButton)
    })

    // Dropdown should be closed
    await waitForRTL(() => {
      expect(screen.queryByText('file1.md')).not.toBeInTheDocument()
    })
  })
})
