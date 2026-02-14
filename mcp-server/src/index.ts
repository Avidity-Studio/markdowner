#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile, writeFile, access, mkdir } from "fs/promises";
import { dirname, join } from "path";
import { homedir } from "os";

// Configuration paths
const CONFIG_DIR = join(homedir(), ".markdown-editor");
const RECENTS_FILE = join(CONFIG_DIR, "recent-files.json");
const THEME_FILE = join(CONFIG_DIR, "theme-preference.json");

// Ensure config directory exists
async function ensureConfigDir() {
  try {
    await access(CONFIG_DIR);
  } catch {
    await mkdir(CONFIG_DIR, { recursive: true });
  }
}

// Read recent files list
async function getRecentFiles(): Promise<string[]> {
  try {
    await ensureConfigDir();
    const data = await readFile(RECENTS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// Save recent files list
async function saveRecentFiles(files: string[]) {
  await ensureConfigDir();
  await writeFile(RECENTS_FILE, JSON.stringify(files.slice(0, 10), null, 2));
}

// Add file to recents
async function addToRecents(filePath: string) {
  const recents = await getRecentFiles();
  const filtered = recents.filter((f) => f !== filePath);
  filtered.unshift(filePath);
  await saveRecentFiles(filtered);
}

// Get current theme preference
async function getThemePreference(): Promise<"light" | "dark" | "system"> {
  try {
    await ensureConfigDir();
    const data = await readFile(THEME_FILE, "utf-8");
    const { theme } = JSON.parse(data);
    return theme || "system";
  } catch {
    return "system";
  }
}

// Save theme preference
async function setThemePreference(theme: "light" | "dark" | "system") {
  await ensureConfigDir();
  await writeFile(THEME_FILE, JSON.stringify({ theme }, null, 2));
}

// Simple markdown to HTML conversion (basic implementation)
function renderMarkdownToHtml(markdown: string): string {
  let html = markdown
    // Escape HTML
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    // Headers
    .replace(/^### (.*$)/gim, "<h3>$1</h3>")
    .replace(/^## (.*$)/gim, "<h2>$1</h2>")
    .replace(/^# (.*$)/gim, "<h1>$1</h1>")
    // Bold and italic
    .replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    // Code blocks
    .replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
      if (lang === "mermaid") {
        return `<pre><code class="language-mermaid">${code}</code></pre>`;
      }
      const langClass = lang ? ` class="language-${lang}"` : "";
      return `<pre><code${langClass}>${code}</code></pre>`;
    })
    // Inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Blockquotes
    .replace(/^> (.*$)/gim, "<blockquote>$1</blockquote>")
    // Unordered lists
    .replace(/^\* (.*$)/gim, "<ul><li>$1</li></ul>")
    .replace(/^- (.*$)/gim, "<ul><li>$1</li></ul>")
    // Ordered lists
    .replace(/^\d+\. (.*$)/gim, "<ol><li>$1</li></ol>")
    // Horizontal rule
    .replace(/^---$/gim, "<hr />")
    // Paragraphs (must be last)
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(.+)$/gim, "<p>$1</p>")
    // Clean up empty paragraphs
    .replace(/<p><\/p>/g, "")
    // Consolidate lists
    .replace(/<\/ul>\s*<ul>/g, "")
    .replace(/<\/ol>\s*<ol>/g, "")
    // Consolidate blockquotes
    .replace(/<\/blockquote>\s*<blockquote>/g, "<br />");

  return html;
}

// Create an MCP server
const server = new McpServer({
  name: "markdown-editor-mcp",
  version: "1.0.0",
});

// Tool: Read a markdown file
server.tool(
  "read_markdown_file",
  {
    path: z.string().describe("Absolute path to the markdown file to read"),
  },
  async ({ path: filePath }) => {
    try {
      const content = await readFile(filePath, "utf-8");
      await addToRecents(filePath);
      return {
        content: [
          {
            type: "text",
            text: content,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error reading file: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool: Write/save a markdown file
server.tool(
  "write_markdown_file",
  {
    path: z.string().describe("Absolute path to save the markdown file"),
    content: z.string().describe("Markdown content to write"),
  },
  async ({ path: filePath, content }) => {
    try {
      // Ensure parent directory exists
      const dir = dirname(filePath);
      await mkdir(dir, { recursive: true });

      await writeFile(filePath, content, "utf-8");
      await addToRecents(filePath);
      return {
        content: [
          {
            type: "text",
            text: `File saved successfully: ${filePath}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error writing file: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool: Render markdown to HTML
server.tool(
  "render_markdown",
  {
    markdown: z.string().describe("Markdown content to render"),
  },
  async ({ markdown }) => {
    try {
      const html = renderMarkdownToHtml(markdown);
      return {
        content: [
          {
            type: "text",
            text: html,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error rendering markdown: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool: Get recent files list
server.tool("get_recent_files", {}, async () => {
  try {
    const recents = await getRecentFiles();
    if (recents.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No recent files found.",
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: recents.join("\n"),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error getting recent files: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Tool: Clear recent files
server.tool("clear_recent_files", {}, async () => {
  try {
    await saveRecentFiles([]);
    return {
      content: [
        {
          type: "text",
          text: "Recent files cleared successfully.",
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error clearing recent files: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Tool: Get theme preference
server.tool("get_theme", {}, async () => {
  try {
    const theme = await getThemePreference();
    return {
      content: [
        {
          type: "text",
          text: `Current theme: ${theme}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error getting theme: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Tool: Set theme preference
server.tool(
  "set_theme",
  {
    theme: z.enum(["light", "dark", "system"]).describe("Theme to set"),
  },
  async ({ theme }) => {
    try {
      await setThemePreference(theme);
      return {
        content: [
          {
            type: "text",
            text: `Theme set to: ${theme}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error setting theme: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool: Check if file exists
server.tool(
  "file_exists",
  {
    path: z.string().describe("Absolute path to check"),
  },
  async ({ path: filePath }) => {
    try {
      await access(filePath);
      return {
        content: [
          {
            type: "text",
            text: "true",
          },
        ],
      };
    } catch {
      return {
        content: [
          {
            type: "text",
            text: "false",
          },
        ],
      };
    }
  }
);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Markdown Editor MCP server running on stdio");
