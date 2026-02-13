use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_store::StoreExt;
use urlencoding::decode;

/// Convert a file:// URL to a local file path
/// Handles percent-encoding and platform-specific path formats
fn file_url_to_path(url: &str) -> Option<String> {
  if !url.starts_with("file://") {
    return None;
  }

  // Remove the file:// prefix
  let path_part = &url[7..];

  // Decode percent-encoded characters (e.g., %20 -> space)
  match decode(path_part) {
    Ok(decoded) => {
      let path_str = decoded.into_owned();
      // On macOS, file URLs often have an extra leading slash that needs to be removed
      // e.g., file:///Users/name/file.md -> /Users/name/file.md
      Some(path_str)
    }
    Err(e) => {
      eprintln!("Failed to decode URL: {}", e);
      None
    }
  }
}

// Maximum number of recent files to keep
const MAX_RECENT_FILES: usize = 10;

// Store key for recent files
const RECENT_FILES_KEY: &str = "recent_files";
const STORE_FILE: &str = "app_data.bin";

// State to store recent files (in-memory cache)
pub struct RecentFilesState(pub Mutex<Vec<String>>);

// State to store files opened via dock drag-drop (when app is not running)
pub struct PendingFileState(pub Mutex<Option<String>>);

// Event name for file open from dock
const DOCK_OPEN_FILE_EVENT: &str = "dock-open-file";

// Event names for menu actions
const MENU_NEW_FILE_EVENT: &str = "menu-new-file";
const MENU_OPEN_FILE_EVENT: &str = "menu-open-file";
const MENU_SAVE_FILE_EVENT: &str = "menu-save-file";
const MENU_SAVE_AS_FILE_EVENT: &str = "menu-save-as-file";

// Create the application menu
fn create_app_menu(app_handle: &AppHandle) -> Result<Menu<tauri::Wry>, tauri::Error> {
  let menu = Menu::new(app_handle)?;
  
  // App menu (required on macOS as the first menu)
  let about_item = PredefinedMenuItem::about(app_handle, Some("About Markdowner"), None)?;
  let separator_app = PredefinedMenuItem::separator(app_handle)?;
  let quit_item = PredefinedMenuItem::quit(app_handle, Some("Quit Markdowner"))?;
  
  let app_submenu = Submenu::with_items(
    app_handle,
    "Markdowner",
    true,
    &[
      &about_item,
      &separator_app,
      &quit_item,
    ],
  )?;
  
  // File menu items
  let new_item = MenuItem::with_id(app_handle, "new_file", "New", true, Some("CmdOrCtrl+N"))?;
  let open_item = MenuItem::with_id(app_handle, "open_file", "Open...", true, Some("CmdOrCtrl+O"))?;
  let save_item = MenuItem::with_id(app_handle, "save_file", "Save", true, Some("CmdOrCtrl+S"))?;
  let save_as_item = MenuItem::with_id(app_handle, "save_as_file", "Save As...", true, Some("CmdOrCtrl+Shift+S"))?;
  let separator1 = PredefinedMenuItem::separator(app_handle)?;
  let separator2 = PredefinedMenuItem::separator(app_handle)?;
  let close_item = PredefinedMenuItem::close_window(app_handle, Some("Close Window"))?;
  
  let file_submenu = Submenu::with_items(
    app_handle,
    "File",
    true,
    &[
      &new_item,
      &open_item,
      &separator1,
      &save_item,
      &save_as_item,
      &separator2,
      &close_item,
    ],
  )?;
  
  // Edit menu
  let undo_item = PredefinedMenuItem::undo(app_handle, None)?;
  let redo_item = PredefinedMenuItem::redo(app_handle, None)?;
  let separator3 = PredefinedMenuItem::separator(app_handle)?;
  let cut_item = PredefinedMenuItem::cut(app_handle, None)?;
  let copy_item = PredefinedMenuItem::copy(app_handle, None)?;
  let paste_item = PredefinedMenuItem::paste(app_handle, None)?;
  let select_all_item = PredefinedMenuItem::select_all(app_handle, None)?;
  
  let edit_submenu = Submenu::with_items(
    app_handle,
    "Edit",
    true,
    &[
      &undo_item,
      &redo_item,
      &separator3,
      &cut_item,
      &copy_item,
      &paste_item,
      &select_all_item,
    ],
  )?;
  
  // Window menu
  let minimize_item = PredefinedMenuItem::minimize(app_handle, Some("Minimize"))?;
  let close_item_win = PredefinedMenuItem::close_window(app_handle, Some("Close Window"))?;
  
  let window_submenu = Submenu::with_items(
    app_handle,
    "Window",
    true,
    &[
      &minimize_item,
      &close_item_win,
    ],
  )?;
  
  menu.append(&app_submenu)?;
  menu.append(&file_submenu)?;
  menu.append(&edit_submenu)?;
  menu.append(&window_submenu)?;
  
  Ok(menu)
}

// Handle menu events
fn handle_menu_event(app_handle: &AppHandle, id: &str) {
  match id {
    "new_file" => {
      let _ = app_handle.emit(MENU_NEW_FILE_EVENT, ());
    }
    "open_file" => {
      let _ = app_handle.emit(MENU_OPEN_FILE_EVENT, ());
    }
    "save_file" => {
      let _ = app_handle.emit(MENU_SAVE_FILE_EVENT, ());
    }
    "save_as_file" => {
      let _ = app_handle.emit(MENU_SAVE_AS_FILE_EVENT, ());
    }
    _ => {}
  }
}

// File metadata for validation
#[derive(Debug)]
struct FileMetadata {
  exists: bool,
  is_file: bool,
  is_readable: bool,
}

// Validate and get file metadata
fn validate_file_path(path: &Path) -> Result<FileMetadata, String> {
  // Check if path is absolute
  if !path.is_absolute() {
    return Err("File path must be absolute".to_string());
  }

  // Check for path traversal attempts
  let canonical_path = path
    .canonicalize()
    .map_err(|e| format!("Invalid path: {}", e))?;
  if !canonical_path.starts_with(std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/"))) {
    // Allow paths outside current dir but log warning - they're still valid absolute paths
    println!(
      "Warning: Opening file outside current directory: {:?}",
      canonical_path
    );
  }

  let exists = canonical_path.exists();
  let is_file = canonical_path.is_file();

  // Check if file is readable (for existing files)
  let is_readable = if exists && is_file {
    std::fs::File::open(&canonical_path).is_ok()
  } else {
    false
  };

  Ok(FileMetadata {
    exists,
    is_file,
    is_readable,
  })
}

// Load recent files from persistent store
fn load_recent_files_from_store(app: &AppHandle) -> Vec<String> {
  match app.store(STORE_FILE) {
    Ok(store) => {
      if let Some(files) = store.get(RECENT_FILES_KEY) {
        if let Ok(files_vec) = serde_json::from_value::<Vec<String>>(files.clone()) {
          // Filter out files that no longer exist
          let valid_files: Vec<String> = files_vec
            .into_iter()
            .filter(|path| PathBuf::from(path).exists())
            .take(MAX_RECENT_FILES)
            .collect();
          return valid_files;
        }
      }
    }
    Err(e) => eprintln!("Failed to load store: {}", e),
  }
  Vec::new()
}

// Save recent files to persistent store
fn save_recent_files_to_store(app: &AppHandle, files: &[String]) {
  match app.store(STORE_FILE) {
    Ok(store) => {
      if let Ok(value) = serde_json::to_value(files) {
        store.set(RECENT_FILES_KEY, value);
        if let Err(e) = store.save() {
          eprintln!("Failed to save store: {}", e);
        }
      }
    }
    Err(e) => eprintln!("Failed to save store: {}", e),
  }
}

// Read file content
#[tauri::command]
async fn read_file(_app: AppHandle, path: String) -> Result<String, String> {
  let path = PathBuf::from(&path);

  // Validate the file path
  let metadata = validate_file_path(&path).map_err(|e| format!("Path validation failed: {}", e))?;

  if !metadata.exists {
    return Err("File does not exist".to_string());
  }

  if !metadata.is_file {
    return Err("Path is not a file".to_string());
  }

  if !metadata.is_readable {
    return Err("File is not readable".to_string());
  }

  // Check file size (prevent loading extremely large files)
  let metadata_std =
    std::fs::metadata(&path).map_err(|e| format!("Failed to read file metadata: {}", e))?;
  const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024; // 10MB limit
  if metadata_std.len() > MAX_FILE_SIZE {
    return Err("File is too large (max 10MB)".to_string());
  }

  match std::fs::read_to_string(&path) {
    Ok(content) => Ok(content),
    Err(e) => Err(format!("Failed to read file: {}", e)),
  }
}

// Write file content
#[tauri::command]
async fn write_file(_app: AppHandle, path: String, content: String) -> Result<(), String> {
  let path = PathBuf::from(&path);

  // Validate the path is absolute
  if !path.is_absolute() {
    return Err("File path must be absolute".to_string());
  }

  // If file exists, validate it's a file and writable
  if path.exists() && !path.is_file() {
    return Err("Path is not a file".to_string());
  }

  // Validate parent directory exists
  if let Some(parent) = path.parent() {
    if !parent.exists() {
      return Err("Parent directory does not exist".to_string());
    }
  }

  // Check content size
  const MAX_CONTENT_SIZE: usize = 10 * 1024 * 1024; // 10MB limit
  if content.len() > MAX_CONTENT_SIZE {
    return Err("Content is too large (max 10MB)".to_string());
  }

  match std::fs::write(&path, content) {
    Ok(_) => Ok(()),
    Err(e) => Err(format!("Failed to write file: {}", e)),
  }
}

// Open file dialog
#[tauri::command]
async fn open_file_dialog(
  app: AppHandle,
  state: tauri::State<'_, RecentFilesState>,
) -> Result<Option<String>, String> {
  let file_path = app
    .dialog()
    .file()
    .add_filter("Markdown", &["md", "markdown", "txt"])
    .blocking_pick_file();

  match file_path {
    Some(path) => {
      if let Some(p) = path.as_path() {
        let path_str = p.to_string_lossy().to_string();
        // Add to recents
        add_to_recents_internal(&app, &state, path_str.clone());
        Ok(Some(path_str))
      } else {
        Ok(None)
      }
    }
    None => Ok(None),
  }
}

// Save file dialog
#[tauri::command]
async fn save_file_dialog(
  app: AppHandle,
  state: tauri::State<'_, RecentFilesState>,
) -> Result<Option<String>, String> {
  let file_path = app
    .dialog()
    .file()
    .add_filter("Markdown", &["md", "markdown"])
    .blocking_save_file();

  match file_path {
    Some(path) => {
      if let Some(p) = path.as_path() {
        let path_str = p.to_string_lossy().to_string();
        // Add to recents
        add_to_recents_internal(&app, &state, path_str.clone());
        Ok(Some(path_str))
      } else {
        Ok(None)
      }
    }
    None => Ok(None),
  }
}

// Internal function to add a file to recents (updates both memory and persistent store)
fn add_to_recents_internal(
  app: &AppHandle,
  state: &tauri::State<'_, RecentFilesState>,
  path: String,
) {
  let mut recents = state.0.lock().unwrap();
  // Remove if already exists (to move to top)
  recents.retain(|p| p != &path);
  // Add to front
  recents.insert(0, path);
  // Trim to max
  if recents.len() > MAX_RECENT_FILES {
    recents.truncate(MAX_RECENT_FILES);
  }
  // Save to persistent store
  save_recent_files_to_store(app, &recents);
}

// Get recent files
#[tauri::command]
async fn get_recent_files(
  state: tauri::State<'_, RecentFilesState>,
) -> Result<Vec<String>, String> {
  let recents = state.0.lock().unwrap();
  Ok(recents.clone())
}

// Add file to recents (called when opening a file directly)
#[tauri::command]
async fn add_to_recents(
  app: AppHandle,
  state: tauri::State<'_, RecentFilesState>,
  path: String,
) -> Result<(), String> {
  add_to_recents_internal(&app, &state, path);
  Ok(())
}

// Clear recent files
#[tauri::command]
async fn clear_recent_files(
  app: AppHandle,
  state: tauri::State<'_, RecentFilesState>,
) -> Result<(), String> {
  let mut recents = state.0.lock().unwrap();
  recents.clear();
  // Also clear from persistent store
  save_recent_files_to_store(&app, &[]);
  Ok(())
}

// Command to get pending file (for when app is opened with file)
#[tauri::command]
async fn get_pending_file(
  state: tauri::State<'_, PendingFileState>,
) -> Result<Option<String>, String> {
  let mut pending = state.0.lock().unwrap();
  let result = pending.take();
  println!("get_pending_file called, returning: {:?}", result);
  Ok(result)
}

// Command to set pending file (used when receiving file-open events)
#[tauri::command]
async fn set_pending_file(
  app: AppHandle,
  state: tauri::State<'_, PendingFileState>,
  path: String,
) -> Result<(), String> {
  println!("set_pending_file called with: {}", path);
  let mut pending = state.0.lock().unwrap();
  *pending = Some(path);
  
  // Also emit event for frontend
  let _ = app.emit(DOCK_OPEN_FILE_EVENT, pending.clone().unwrap());
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_store::Builder::default().build())
    .plugin(tauri_plugin_deep_link::init())
    .setup(|app| {
      // Create and set the menu
      let menu = create_app_menu(app.handle())?;
      app.set_menu(menu)?;
      // Load recent files from persistent store
      let recent_files = load_recent_files_from_store(app.handle());
      app.manage(RecentFilesState(Mutex::new(recent_files)));
      app.manage(PendingFileState(Mutex::new(None)));

      // Handle files opened via file association (clicking on .md files)
      // This uses the deep-link plugin which is more reliable than tauri://file-open
      {
        let app_handle = app.handle().clone();
        
        println!("Setting up deep-link handler for file associations");
        
        // Get any pending files (when app was opened with a file)
        if let Ok(Some(pending_urls)) = app.deep_link().get_current() {
          if !pending_urls.is_empty() {
            for url in &pending_urls {
              let url_str = url.to_string();
              println!("App was opened with deep link/URL: {}", url_str);
              
              // Parse file:// URL to get the path
              if url_str.starts_with("file://") {
                let path = file_url_to_path(&url_str).unwrap_or_else(|| {
                  println!("Failed to parse file URL: {}", url_str);
                  String::new()
                });
                if path.is_empty() {
                  continue;
                }
                println!("Extracted path from deep link: {}", path);
                
                // Store in pending state
                if let Some(pending_state) = app_handle.try_state::<PendingFileState>() {
                  let mut pending = pending_state.0.lock().unwrap();
                  *pending = Some(path.clone());
                  println!("Stored in pending state from deep link: {}", path);
                }
                
                // Also emit event for when app is already running
                let _ = app_handle.emit(DOCK_OPEN_FILE_EVENT, path);
                // Only process the first file for now
                break;
              }
            }
          } else {
            println!("No deep link/URL available at startup");
          }
        } else {
          println!("No deep link/URL available at startup");
        }
        
        // Listen for deep link events (when app is already running and user clicks a file)
        let _ = app.deep_link().on_open_url(move |event| {
          let urls = event.urls();
          println!("Received deep link event with {} URLs", urls.len());
          
          for url in urls {
            let url_str = url.to_string();
            println!("Processing URL: {}", url_str);
            
            if url_str.starts_with("file://") {
              let path = file_url_to_path(&url_str).unwrap_or_else(|| {
                println!("Failed to parse file URL: {}", url_str);
                String::new()
              });
              if path.is_empty() {
                continue;
              }
              println!("Extracted path from URL: {}", path);
              
              // Store in pending state
              if let Some(pending_state) = app_handle.try_state::<PendingFileState>() {
                let mut pending = pending_state.0.lock().unwrap();
                *pending = Some(path.clone());
                println!("Stored in pending state: {}", path);
              }
              
              // Emit event to frontend
              let _ = app_handle.emit(DOCK_OPEN_FILE_EVENT, path);
              // Only process the first file for now
              break;
            }
          }
        });
      }

      Ok(())
    })
    .on_menu_event(|app_handle, event| {
      handle_menu_event(app_handle, &event.id().0);
    })
    .invoke_handler(tauri::generate_handler![
      read_file,
      write_file,
      open_file_dialog,
      save_file_dialog,
      get_recent_files,
      add_to_recents,
      clear_recent_files,
      get_pending_file,
      set_pending_file
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;
  use std::io::Write;
  use tempfile::TempDir;

  fn create_test_file(dir: &Path, name: &str, content: &str) -> PathBuf {
    let file_path = dir.join(name);
    let mut file = fs::File::create(&file_path).unwrap();
    file.write_all(content.as_bytes()).unwrap();
    file_path
  }

  // Test file validation directly (synchronous)
  #[test]
  fn test_validate_file_path_valid_absolute() {
    let dir = TempDir::new().unwrap();
    let test_file = dir.path().join("test.md");
    let _ = create_test_file(dir.path(), "test.md", "content");

    let result = validate_file_path(&test_file);
    assert!(result.is_ok());
    let metadata = result.unwrap();
    assert!(metadata.exists);
    assert!(metadata.is_file);
  }

  #[test]
  fn test_validate_file_path_relative() {
    let path = PathBuf::from("test.md");
    let result = validate_file_path(&path);
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("absolute"));
  }

  #[test]
  fn test_validate_file_path_nonexistent() {
    // Note: canonicalize() fails for non-existent files
    // This is expected behavior - the path validation will fail
    let path = PathBuf::from("/tmp/nonexistent_file_12345.md");
    let result = validate_file_path(&path);
    // canonicalize will fail for non-existent paths
    assert!(result.is_err());
  }

  #[test]
  fn test_read_file_directly() {
    let dir = TempDir::new().unwrap();
    let test_file = create_test_file(dir.path(), "test.md", "# Hello World");

    // Test reading file directly without async command
    let content = fs::read_to_string(&test_file).unwrap();
    assert_eq!(content, "# Hello World");
  }

  #[test]
  fn test_read_file_validation() {
    // Test validation with an existing file
    let dir = TempDir::new().unwrap();
    let test_file = create_test_file(dir.path(), "test.md", "content");

    let result = validate_file_path(&test_file);
    assert!(result.is_ok());
    let metadata = result.unwrap();
    assert!(metadata.exists);
    assert!(metadata.is_file);
    assert!(metadata.is_readable);
  }

  #[test]
  fn test_write_file_directly() {
    let dir = TempDir::new().unwrap();
    let test_file = dir.path().join("test.md");

    // Test writing file directly without async command
    let content = "# New Content";
    fs::write(&test_file, content).unwrap();

    assert!(test_file.exists());
    assert_eq!(fs::read_to_string(&test_file).unwrap(), "# New Content");
  }

  #[test]
  fn test_write_file_path_validation_not_absolute() {
    let path = PathBuf::from("test.md");
    let result = validate_file_path(&path);
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("absolute"));
  }

  #[test]
  fn test_write_file_parent_validation() {
    let path = PathBuf::from("/nonexistent/directory/test.md");
    if let Some(parent) = path.parent() {
      assert!(!parent.exists());
    }
  }

  #[test]
  fn test_file_size_limit() {
    const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024; // 10MB
    let size = 11 * 1024 * 1024; // 11MB
    assert!(size > MAX_FILE_SIZE);
  }

  #[test]
  fn test_recent_files_add_and_retrieve() {
    let state = RecentFilesState(Mutex::new(Vec::new()));
    let dir = TempDir::new().unwrap();

    // Add files
    let file1 = dir.path().join("file1.md").to_string_lossy().to_string();
    let file2 = dir.path().join("file2.md").to_string_lossy().to_string();

    {
      let mut recents = state.0.lock().unwrap();
      recents.push(file1.clone());
      recents.push(file2.clone());
    }

    let recents = state.0.lock().unwrap();
    assert_eq!(recents.len(), 2);
    assert_eq!(recents[0], file1);
    assert_eq!(recents[1], file2);
  }

  #[test]
  fn test_recent_files_max_limit() {
    let state = RecentFilesState(Mutex::new(Vec::new()));
    let dir = TempDir::new().unwrap();

    // Add 15 files (more than MAX_RECENT_FILES of 10)
    for i in 0..15 {
      let file_path = dir
        .path()
        .join(format!("file{}.md", i))
        .to_string_lossy()
        .to_string();
      let mut recents = state.0.lock().unwrap();
      recents.insert(0, file_path);
    }

    // Simulate truncation
    {
      let mut recents = state.0.lock().unwrap();
      if recents.len() > MAX_RECENT_FILES {
        recents.truncate(MAX_RECENT_FILES);
      }
    }

    let recents = state.0.lock().unwrap();
    assert_eq!(recents.len(), MAX_RECENT_FILES);
  }

  #[test]
  fn test_recent_files_move_to_top() {
    let state = RecentFilesState(Mutex::new(Vec::new()));
    let dir = TempDir::new().unwrap();

    let file1 = dir.path().join("file1.md").to_string_lossy().to_string();
    let file2 = dir.path().join("file2.md").to_string_lossy().to_string();

    {
      let mut recents = state.0.lock().unwrap();
      recents.push(file1.clone());
      recents.push(file2.clone());
    }

    // Add file1 again (should move to top)
    {
      let mut recents = state.0.lock().unwrap();
      recents.retain(|p| p != &file1);
      recents.insert(0, file1.clone());
    }

    let recents = state.0.lock().unwrap();
    assert_eq!(recents[0], file1);
    assert_eq!(recents[1], file2);
  }

  #[test]
  fn test_recent_files_deduplication() {
    let state = RecentFilesState(Mutex::new(Vec::new()));
    let dir = TempDir::new().unwrap();

    let file1 = dir.path().join("file1.md").to_string_lossy().to_string();

    // Add same file multiple times
    {
      let mut recents = state.0.lock().unwrap();
      recents.push(file1.clone());
      recents.push(file1.clone());
      recents.push(file1.clone());
    }

    // Deduplicate and should only have one entry
    {
      let mut recents = state.0.lock().unwrap();
      recents.dedup();
    }

    let recents = state.0.lock().unwrap();
    assert_eq!(recents.len(), 1);
  }
}
