use serde::Serialize;
use std::collections::HashMap;

#[derive(Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
}

#[derive(Serialize)]
pub struct SkillFileEntry {
    pub name: String,
    pub description: String,
    pub content: String,
    pub body: String,
    pub path: String,
    pub emoji: String,
    pub version: String,
}

/// List directory contents, directories first, then alphabetically
#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let entries = std::fs::read_dir(&path).map_err(|e| format!("Failed to read directory: {e}"))?;

    let mut files: Vec<FileEntry> = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {e}"))?;
        let metadata = entry.metadata().map_err(|e| format!("Failed to read metadata: {e}"))?;

        let file_name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files/directories (starting with .)
        if file_name.starts_with('.') {
            continue;
        }

        files.push(FileEntry {
            name: file_name,
            path: entry.path().to_string_lossy().to_string(),
            is_dir: metadata.is_dir(),
            size: if metadata.is_file() {
                Some(metadata.len())
            } else {
                None
            },
        });
    }

    // Sort: directories first, then alphabetically (case-insensitive)
    files.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(files)
}

/// Read a text file and return its contents
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {e}"))
}

fn parse_frontmatter(content: &str) -> (HashMap<String, String>, String) {
    let mut meta = HashMap::new();
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        return (meta, content.to_string());
    }
    let after_first = &trimmed[3..];
    if let Some(end_pos) = after_first.find("\n---") {
        let front = after_first[..end_pos].trim();
        let body = after_first[end_pos + 4..].trim().to_string();
        for line in front.lines() {
            if let Some(colon_pos) = line.find(':') {
                let key = line[..colon_pos].trim().to_lowercase();
                let value = line[colon_pos + 1..].trim().to_string();
                meta.insert(key, value);
            }
        }
        return (meta, body);
    }
    (meta, content.to_string())
}

fn walk_skill_files(dir: &std::path::Path, entries: &mut Vec<SkillFileEntry>, visited: &mut Vec<std::path::PathBuf>, depth: usize) {
    const MAX_DEPTH: usize = 32;
    const MAX_FILE_SIZE: u64 = 1_048_576;

    if depth > MAX_DEPTH {
        return;
    }

    if let Ok(canon) = dir.canonicalize() {
        if visited.contains(&canon) {
            return;
        }
        visited.push(canon);
    }

    let dir_entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in dir_entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        let file_name = entry.file_name();
        let name_str = file_name.to_string_lossy();

        if name_str.starts_with('.') {
            continue;
        }

        let path = entry.path();

        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        // Skip common large directories
        if metadata.is_dir() {
            let lower = name_str.to_lowercase();
            if lower == "node_modules" || lower == ".git" || lower == "target" || lower == ".kilo" || lower == "__pycache__" || lower == ".next" || lower == "dist" || lower == ".cache" {
                continue;
            }
        }

        if metadata.is_dir() {
            walk_skill_files(&path, entries, visited, depth + 1);
        } else if metadata.is_file() && metadata.len() <= MAX_FILE_SIZE && name_str.to_lowercase() == "skill.md" {
            if let Ok(content) = std::fs::read_to_string(&path) {
                let (meta, body) = parse_frontmatter(&content);
                let name = meta.get("name").cloned()
                    .unwrap_or_else(|| path.file_stem().unwrap_or_default().to_string_lossy().to_string());
                let description = meta.get("description").cloned().unwrap_or_default();
                let emoji = meta.get("emoji").cloned().unwrap_or_default();
                let version = meta.get("version").cloned().unwrap_or_default();
                entries.push(SkillFileEntry {
                    name,
                    description,
                    content,
                    body,
                    path: path.to_string_lossy().to_string(),
                    emoji,
                    version,
                });
            }
        }
    }
}

/// Scan directories recursively for SKILL.md files and parse them
#[tauri::command]
pub async fn scan_skill_files(paths: Vec<String>) -> Result<Vec<SkillFileEntry>, String> {
    tokio::task::spawn_blocking(move || {
        let mut results = Vec::new();
        for path_str in &paths {
            let path = std::path::Path::new(path_str);
            if !path.is_dir() {
                continue;
            }
            let mut visited = Vec::new();
            walk_skill_files(path, &mut results, &mut visited, 0);
        }
        Ok(results)
    })
    .await
    .map_err(|e| format!("Scan interrupted: {}", e))?
}

/// Parse a single SKILL.md file and return its contents
#[tauri::command]
pub fn parse_skill_file(path: String) -> Result<SkillFileEntry, String> {
    let path_buf = std::path::Path::new(&path);

    let metadata = std::fs::metadata(&path).map_err(|e| format!("Failed to read file metadata: {e}"))?;
    if metadata.len() > 1_048_576 {
        return Err("File too large (>1MB)".to_string());
    }

    let content = std::fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {e}"))?;

    let (meta, body) = parse_frontmatter(&content);
    let name = meta.get("name").cloned()
        .unwrap_or_else(|| path_buf.file_stem().unwrap_or_default().to_string_lossy().to_string());
    let description = meta.get("description").cloned().unwrap_or_default();
    let emoji = meta.get("emoji").cloned().unwrap_or_default();
    let version = meta.get("version").cloned().unwrap_or_default();

    Ok(SkillFileEntry {
        name,
        description,
        content,
        body,
        path,
        emoji,
        version,
    })
}
