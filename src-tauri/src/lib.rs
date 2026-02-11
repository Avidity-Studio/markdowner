use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_store::StoreExt;
#[cfg(target_os = "macos")]
use tauri_plugin_deep_link::DeepLinkExt;

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

// File metadata for validation
#[derive(Debug)]
struct FileMetadata {
    exists: bool,
    is_file: bool,
    is_readable: bool,
}

// Validate and get file metadata
fn validate_file_path(path: &PathBuf) -> Result<FileMetadata, String> {
    // Check if path is absolute
    if !path.is_absolute() {
        return Err("File path must be absolute".to_string());
    }

    // Check for path traversal attempts
    let canonical_path = path.canonicalize().map_err(|e| format!("Invalid path: {}", e))?;
    if !canonical_path.starts_with(std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/"))) {
        // Allow paths outside current dir but log warning - they're still valid absolute paths
        println!("Warning: Opening file outside current directory: {:?}", canonical_path);
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
async fn read_file(app: AppHandle, path: String) -> Result<String, String> {
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
    let metadata_std = std::fs::metadata(&path).map_err(|e| format!("Failed to read file metadata: {}", e))?;
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
async fn write_file(app: AppHandle, path: String, content: String) -> Result<(), String> {
    let path = PathBuf::from(&path);

    // Validate the path is absolute
    if !path.is_absolute() {
        return Err("File path must be absolute".to_string());
    }

    // If file exists, validate it's a file and writable
    if path.exists() {
        if !path.is_file() {
            return Err("Path is not a file".to_string());
        }
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
async fn open_file_dialog(app: AppHandle, state: tauri::State<'_, RecentFilesState>) -> Result<Option<String>, String> {
    let file_path = app.dialog().file().add_filter("Markdown", &["md", "markdown", "txt"]).blocking_pick_file();

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
async fn save_file_dialog(app: AppHandle, state: tauri::State<'_, RecentFilesState>) -> Result<Option<String>, String> {
    let file_path = app.dialog().file().add_filter("Markdown", &["md", "markdown"]).blocking_save_file();

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
fn add_to_recents_internal(app: &AppHandle, state: &tauri::State<'_, RecentFilesState>, path: String) {
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
async fn get_recent_files(state: tauri::State<'_, RecentFilesState>) -> Result<Vec<String>, String> {
    let recents = state.0.lock().unwrap();
    Ok(recents.clone())
}

// Add file to recents (called when opening a file directly)
#[tauri::command]
async fn add_to_recents(app: AppHandle, state: tauri::State<'_, RecentFilesState>, path: String) -> Result<(), String> {
    add_to_recents_internal(&app, &state, path);
    Ok(())
}

// Clear recent files
#[tauri::command]
async fn clear_recent_files(app: AppHandle, state: tauri::State<'_, RecentFilesState>) -> Result<(), String> {
    let mut recents = state.0.lock().unwrap();
    recents.clear();
    // Also clear from persistent store
    save_recent_files_to_store(&app, &[]);
    Ok(())
}

// Command to get pending file (for when app is opened with file)
#[tauri::command]
async fn get_pending_file(state: tauri::State<'_, PendingFileState>) -> Result<Option<String>, String> {
    let mut pending = state.0.lock().unwrap();
    Ok(pending.take())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            // Load recent files from persistent store
            let recent_files = load_recent_files_from_store(app.handle());
            app.manage(RecentFilesState(Mutex::new(recent_files)));
            app.manage(PendingFileState(Mutex::new(None)));

            // Handle files opened via dock drag-drop on macOS
            #[cfg(target_os = "macos")]
            {
                let app_handle = app.handle().clone();

                // Listen for open-file events from the dock
                // This handles files dropped on the dock icon both when app is running and not running
                let _ = app.deep_link().on_open_url(move |event| {
                    // The URL will be file://path/to/file
                    let url = &event.urls()[0];
                    if let Ok(path) = url.to_file_path() {
                        let path_str = path.to_string_lossy().to_string();
                        let _ = app_handle.emit(DOCK_OPEN_FILE_EVENT, path_str);
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            open_file_dialog,
            save_file_dialog,
            get_recent_files,
            add_to_recents,
            clear_recent_files,
            get_pending_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
