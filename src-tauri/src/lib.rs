use std::path::PathBuf;
use std::sync::Mutex;
use tauri::AppHandle;
use tauri::Emitter;
use tauri_plugin_dialog::DialogExt;
#[cfg(target_os = "macos")]
use tauri_plugin_deep_link::DeepLinkExt;

// Maximum number of recent files to keep
const MAX_RECENT_FILES: usize = 10;

// State to store recent files
pub struct RecentFilesState(pub Mutex<Vec<String>>);

// State to store files opened via dock drag-drop (when app is not running)
pub struct PendingFileState(pub Mutex<Option<String>>);

// Event name for file open from dock
const DOCK_OPEN_FILE_EVENT: &str = "dock-open-file";

// Read file content
#[tauri::command]
async fn read_file(_app: AppHandle, path: String) -> Result<String, String> {
    let path = PathBuf::from(path);
    match std::fs::read_to_string(&path) {
        Ok(content) => Ok(content),
        Err(e) => Err(format!("Failed to read file: {}", e)),
    }
}

// Write file content
#[tauri::command]
async fn write_file(_app: AppHandle, path: String, content: String) -> Result<(), String> {
    let path = PathBuf::from(path);
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
                add_to_recents_internal(&state, path_str.clone());
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
                add_to_recents_internal(&state, path_str.clone());
                Ok(Some(path_str))
            } else {
                Ok(None)
            }
        }
        None => Ok(None),
    }
}

// Internal function to add a file to recents
fn add_to_recents_internal(state: &tauri::State<'_, RecentFilesState>, path: String) {
    let mut recents = state.0.lock().unwrap();
    // Remove if already exists (to move to top)
    recents.retain(|p| p != &path);
    // Add to front
    recents.insert(0, path);
    // Trim to max
    if recents.len() > MAX_RECENT_FILES {
        recents.truncate(MAX_RECENT_FILES);
    }
}

// Get recent files
#[tauri::command]
async fn get_recent_files(state: tauri::State<'_, RecentFilesState>) -> Result<Vec<String>, String> {
    let recents = state.0.lock().unwrap();
    Ok(recents.clone())
}

// Add file to recents (called when opening a file directly)
#[tauri::command]
async fn add_to_recents(state: tauri::State<'_, RecentFilesState>, path: String) -> Result<(), String> {
    add_to_recents_internal(&state, path);
    Ok(())
}

// Clear recent files
#[tauri::command]
async fn clear_recent_files(state: tauri::State<'_, RecentFilesState>) -> Result<(), String> {
    let mut recents = state.0.lock().unwrap();
    recents.clear();
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
        .manage(RecentFilesState(Mutex::new(Vec::new())))
        .manage(PendingFileState(Mutex::new(None)))
        .setup(|app| {
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
