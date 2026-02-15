// Print functionality for markdown editor
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const PRINT_TEMP_DIR: &str = ".markdowner_print";

// Print markdown content by opening the system print dialog directly
#[tauri::command]
pub async fn print_markdown(
  app: AppHandle,
  title: String,
  html_content: String,
) -> Result<(), String> {
  use std::fs;

  eprintln!("[PRINT DEBUG] print_markdown called with title: '{}'", title);
  eprintln!("[PRINT DEBUG] HTML content length: {} bytes", html_content.len());

  // Get temp directory
  let temp_dir = std::env::temp_dir();
  let print_dir = temp_dir.join(PRINT_TEMP_DIR);

  // Create print directory if it doesn't exist
  if !print_dir.exists() {
    eprintln!("[PRINT DEBUG] Creating print directory: {:?}", print_dir);
    fs::create_dir_all(&print_dir)
      .map_err(|e| format!("Failed to create print directory: {}", e))?;
  }

  // Clean up old print files (keep only the last 10)
  if let Ok(entries) = fs::read_dir(&print_dir) {
    let mut files: Vec<_> = entries
      .filter_map(|e| e.ok())
      .filter(|e| {
        e.path()
          .extension()
          .map(|ext| ext == "html")
          .unwrap_or(false)
      })
      .collect();

    // Sort by modified time, oldest first
    files.sort_by(|a, b| {
      let a_time = a.metadata().and_then(|m| m.modified()).ok();
      let b_time = b.metadata().and_then(|m| m.modified()).ok();
      a_time.cmp(&b_time)
    });

    // Remove old files if more than 10
    while files.len() >= 10 {
      if let Some(old_file) = files.first() {
        eprintln!("[PRINT DEBUG] Removing old print file: {:?}", old_file.path());
        let _ = fs::remove_file(old_file.path());
        files.remove(0);
      }
    }
  }

  // Create a unique filename
  let timestamp = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .unwrap_or_default()
    .as_secs();
  let safe_title = title
    .replace(|c: char| !c.is_alphanumeric() && c != ' ', "_")
    .replace(' ', "_");
  let filename = format!("{}_{}.html", safe_title, timestamp);
  let file_path = print_dir.join(&filename);

  eprintln!("[PRINT DEBUG] Generated filename: {}", filename);
  eprintln!("[PRINT DEBUG] File path: {:?}", file_path);

  // Create a unique window label
  let window_label = format!("print-hidden-{}", timestamp);
  eprintln!("[PRINT DEBUG] Window label: {}", window_label);

  // Create the full HTML content
  let full_html = format!(
    r##"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <style>
      @page {{
          margin: 2cm;
      }}
      body {{
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
          font-size: 12pt;
          line-height: 1.6;
          color: #333;
          max-width: 100%;
          margin: 0;
          padding: 20px;
      }}
      h1, h2, h3 {{
          page-break-after: avoid;
      }}
      pre, blockquote, table, figure, img {{
          page-break-inside: avoid;
      }}
      pre {{
          background-color: #f5f5f5;
          padding: 12px;
          border-radius: 4px;
          overflow-x: auto;
          white-space: pre-wrap;
          word-wrap: break-word;
          border: 1px solid #ddd;
      }}
      code {{
          background-color: #f3f4f6;
          padding: 2px 6px;
          border-radius: 3px;
          font-family: 'SF Mono', Monaco, Inconsolata, 'Fira Code', monospace;
          font-size: 0.9em;
      }}
      pre code {{
          background-color: transparent;
          padding: 0;
      }}
      blockquote {{
          border-left: 4px solid #2563eb;
          padding-left: 16px;
          margin: 16px 0;
          color: #666;
          font-style: italic;
      }}
      table {{
          width: 100%;
          border-collapse: collapse;
          margin: 16px 0;
      }}
      th, td {{
          border: 1px solid #e0e0e0;
          padding: 8px 12px;
          text-align: left;
      }}
      th {{
          background-color: #f9fafb;
          font-weight: 600;
      }}
      img {{
          max-width: 100%;
          height: auto;
      }}
      a[href]::after {{
          content: " (" attr(href) ")";
          font-size: 90%;
          color: #666;
      }}
      .mermaid-container {{
          text-align: center;
          margin: 16px 0;
      }}
      .math-display {{
          margin: 16px 0;
          text-align: center;
      }}
  </style>
</head>
<body>
  <div class="markdown-content">
      {content}
  </div>
  <script>
    // Initialize Mermaid
    mermaid.initialize({{
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'strict'
    }});

    // Simple hash function for mermaid diagrams
    function hashString(str) {{
      let hash = 0;
      for (let i = 0; i < str.length; i++) {{
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
      }}
      return Math.abs(hash).toString(36);
    }}

    // Render mermaid diagrams
    async function renderMermaidDiagrams() {{
      const mermaidBlocks = document.querySelectorAll('pre code.language-mermaid');
      for (const block of mermaidBlocks) {{
        const code = block.textContent || '';
        const id = 'mermaid-' + hashString(code);
        const pre = block.parentElement;
        if (!pre) continue;

        try {{
          const {{ svg }} = await mermaid.render(id + '-svg', code);
          const container = document.createElement('div');
          container.id = id;
          container.className = 'mermaid-container';
          container.innerHTML = svg;
          pre.parentElement?.replaceChild(container, pre);
        }} catch (error) {{
          console.error('Failed to render mermaid diagram:', error);
          pre.classList.add('mermaid-error');
        }}
      }}
    }}

    // Render math expressions using KaTeX
    function renderMath() {{
      if (typeof renderMathInElement === 'undefined') {{
        setTimeout(renderMath, 100);
        return;
      }}
      
      renderMathInElement(document.body, {{
        delimiters: [
          {{left: '$$', right: '$$', display: true}},
          {{left: '$', right: '$', display: false}}
        ],
        throwOnError: false,
        errorColor: '#cc0000'
      }});

      const inlineMathElements = document.querySelectorAll('.math-inline');
      inlineMathElements.forEach(el => {{
        const mathContent = decodeURIComponent(el.getAttribute('data-math') || '');
        if (mathContent && typeof katex !== 'undefined') {{
          try {{
            katex.render(mathContent, el, {{ throwOnError: false, displayMode: false }});
          }} catch (e) {{
            console.error('Failed to render inline math:', e);
          }}
        }}
      }});

      const displayMathElements = document.querySelectorAll('.math-display');
      displayMathElements.forEach(el => {{
        const mathContent = decodeURIComponent(el.getAttribute('data-math') || '');
        if (mathContent && typeof katex !== 'undefined') {{
          try {{
            katex.render(mathContent, el, {{ throwOnError: false, displayMode: true }});
          }} catch (e) {{
            console.error('Failed to render display math:', e);
          }}
        }}
      }});
    }}

    // Initialize everything when DOM is ready
    document.addEventListener('DOMContentLoaded', async () => {{
      await renderMermaidDiagrams();
      renderMath();
      // Notify that content is ready for printing
      document.body.setAttribute('data-ready', 'true');
    }});

    // Signal that we're ready for the print dialog
    window.addEventListener('load', function() {{
      console.log('[PRINT] Window loaded and ready');
    }});
  </script>
</body>
</html>"##,
    title, content = html_content
  );

  // Write the HTML file
  eprintln!("[PRINT DEBUG] Writing HTML file to: {:?}", file_path);
  fs::write(&file_path, &full_html).map_err(|e| {
    eprintln!("[PRINT DEBUG] FAILED to write print file: {}", e);
    format!("Failed to write print file: {}", e)
  })?;
  eprintln!("[PRINT DEBUG] HTML file written successfully ({} bytes)", full_html.len());

  // Open the file in a Tauri window and trigger print
  let file_url = format!("file://{}", file_path.to_string_lossy());
  eprintln!("[PRINT DEBUG] File URL: {}", file_url);

  eprintln!("[PRINT DEBUG] Creating hidden print webview window...");
  let window = WebviewWindowBuilder::new(&app, &window_label, WebviewUrl::External(file_url.parse().map_err(|e| {
    eprintln!("[PRINT DEBUG] FAILED to parse URL: {}", e);
    format!("Invalid URL: {}", e)
  })?))
    .inner_size(1.0, 1.0)
    .visible(false)
    .build()
    .map_err(|e| {
      eprintln!("[PRINT DEBUG] FAILED to create print window: {}", e);
      format!("Failed to create print window: {}", e)
    })?;
  eprintln!("[PRINT DEBUG] Hidden print window created successfully with label: {}", window_label);

  // Wait for content to load then trigger print dialog
  let window_clone = window.clone();
  let window_label_clone = window_label.clone();
  std::thread::spawn(move || {
    eprintln!("[PRINT DEBUG] Print thread started for window: {}", window_label_clone);
    
    // Give time for the page to fully load and render (including mermaid and math)
    eprintln!("[PRINT DEBUG] Waiting 2500ms for page to load and render...");
    std::thread::sleep(std::time::Duration::from_millis(2500));
    
    // Trigger the system print dialog
    // NOTE: In Tauri v2, window.print() is NON-BLOCKING - it returns immediately
    // after showing the dialog, not after the user dismisses it
    eprintln!("[PRINT DEBUG] About to trigger print dialog for window: {}", window_label_clone);
    match window_clone.print() {
      Ok(_) => eprintln!("[PRINT DEBUG] Print dialog triggered successfully for window: {}", window_label_clone),
      Err(e) => eprintln!("[PRINT DEBUG] FAILED to trigger print dialog: {}", e),
    }
    
    // Wait for the print dialog to be dismissed (either printed or cancelled)
    // NOTE: In Tauri v2, window.print() is NON-BLOCKING - it returns immediately
    // after showing the dialog, not after the user dismisses it.
    // We need to estimate how long the user might take with the print dialog.
    eprintln!("[PRINT DEBUG] Waiting for print dialog interaction...");
    
    // Wait a reasonable time for user to interact with the print dialog
    // Most users take 5-15 seconds to configure print settings and either print or cancel
    std::thread::sleep(std::time::Duration::from_secs(300));
    
    // Check if window still exists and close it
    // The hidden window won't have user interaction, so we just need to clean it up
    eprintln!("[PRINT DEBUG] Closing print window: {}", window_label_clone);
    match window_clone.close() {
      Ok(_) => eprintln!("[PRINT DEBUG] Print window closed successfully: {}", window_label_clone),
      Err(e) => eprintln!("[PRINT DEBUG] Print window may already be closed: {}", e),
    }
    
    eprintln!("[PRINT DEBUG] Print thread completed for window: {}", window_label_clone);
  });

  eprintln!("[PRINT DEBUG] print_markdown command completed, print thread spawned");
  Ok(())
}

// Command to close a print preview window by label
#[tauri::command]
pub async fn close_print_window(app: AppHandle, label: String) -> Result<(), String> {
  eprintln!("[PRINT DEBUG] close_print_window called for label: {}", label);
  
  let windows = app.webview_windows();
  eprintln!("[PRINT DEBUG] Total windows open: {}", windows.len());
  
  for (_win_label, window) in windows {
    eprintln!("[PRINT DEBUG] Checking window: {}", _win_label);
    if _win_label == label {
      eprintln!("[PRINT DEBUG] Found matching window, closing: {}", label);
      match window.close() {
        Ok(_) => {
          eprintln!("[PRINT DEBUG] Window closed successfully: {}", label);
          return Ok(());
        },
        Err(e) => {
          eprintln!("[PRINT DEBUG] FAILED to close window {}: {}", label, e);
          return Err(format!("Failed to close window: {}", e));
        }
      }
    }
  }
  
  eprintln!("[PRINT DEBUG] Window not found: {}", label);
  Ok(())
}
