use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
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

#[derive(Serialize)]
pub struct RemoteSkillEntry {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub description: String,
    pub source: String,
    pub owner: Option<String>,
    pub downloads: Option<u64>,
    pub install_mode: String,
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

/// Read a binary file and return its contents as base64
#[tauri::command]
pub fn read_file_base64(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("Failed to read file: {e}"))?;
    Ok(BASE64_STANDARD.encode(bytes))
}

pub(crate) fn parse_frontmatter(content: &str) -> (HashMap<String, String>, String) {
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
    tauri::async_runtime::spawn_blocking(move || {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_default();
        let default_skills = std::path::Path::new(&home).join(".pi").join("agent").join("skills");

        let mut results = Vec::new();
        let mut scanned = std::collections::HashSet::new();

        // Always scan the default skills directory
        if default_skills.is_dir() {
            let mut visited = Vec::new();
            walk_skill_files(&default_skills, &mut results, &mut visited, 0);
            scanned.insert(default_skills);
        }

        for path_str in &paths {
            // Expand ~ to home directory
            let resolved = if path_str.starts_with('~') {
                std::path::Path::new(&home).join(&path_str[1..].trim_start_matches(|c| c == '/' || c == '\\'))
            } else {
                std::path::Path::new(path_str).to_path_buf()
            };

            if !resolved.is_dir() {
                continue;
            }
            // Skip if already scanned (e.g. user added the default dir explicitly)
            if let Ok(canon) = resolved.canonicalize() {
                if scanned.contains(&canon) {
                    continue;
                }
                scanned.insert(canon);
            }

            let mut visited = Vec::new();
            walk_skill_files(&resolved, &mut results, &mut visited, 0);
        }
        Ok(results)
    })
    .await
    .map_err(|e| format!("Scan interrupted: {:?}", e))?
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

#[tauri::command]
pub async fn search_remote_skills(source: String, query: Option<String>) -> Result<Vec<RemoteSkillEntry>, String> {
    let source_lower = source.to_lowercase();
    let query = query.unwrap_or_default().trim().to_string();
    let client = reqwest::Client::builder()
        .user_agent("S-Loop/0.1.0")
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    if source_lower == "clawhub" {
        let url = if query.is_empty() {
            "https://clawhub.ai/api/v1/skills?limit=24&sort=stars&nonSuspiciousOnly=true".to_string()
        } else {
            format!(
                "https://clawhub.ai/api/v1/search?q={}&limit=24&sort=stars&nonSuspiciousOnly=true",
                urlencoding::encode(&query)
            )
        };

        let json = client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("Remote search failed: {e}"))?
            .error_for_status()
            .map_err(|e| format!("Remote search failed: {e}"))?
            .json::<serde_json::Value>()
            .await
            .map_err(|e| format!("Invalid search response: {e}"))?;

        let items = json
            .get("results")
            .and_then(|v| v.as_array())
            .or_else(|| json.get("items").and_then(|v| v.as_array()))
            .cloned()
            .unwrap_or_default();

        let mut results = items
            .into_iter()
            .filter_map(|item| {
                let slug = item.get("slug")?.as_str()?.to_string();
                let display_name = item
                    .get("displayName")
                    .and_then(|v| v.as_str())
                    .unwrap_or(&slug)
                    .to_string();
                let description = item
                    .get("summary")
                    .and_then(|v| v.as_str())
                    .unwrap_or("This remote skill has no summary yet.")
                    .to_string();
                let owner = item
                    .get("ownerHandle")
                    .and_then(|v| v.as_str())
                    .map(|v| v.to_string());
                let downloads = item
                    .get("downloads")
                    .and_then(|v| v.as_u64())
                    .or_else(|| item.get("stats").and_then(|stats| stats.get("downloads")).and_then(|v| v.as_u64()));

                Some(RemoteSkillEntry {
                    id: slug.clone(),
                    slug,
                    name: display_name,
                    description,
                    source: "clawhub".to_string(),
                    owner,
                    downloads,
                    install_mode: "Package".to_string(),
                })
            })
            .collect::<Vec<_>>();

        // Sort by downloads descending (API sort=downloads should handle this,
        // but local sort guarantees consistency regardless of API behavior)
        results.sort_by(|a, b| b.downloads.unwrap_or(0).cmp(&a.downloads.unwrap_or(0)));
        return Ok(results);
    }

    let mut url = "https://api.skillhub.tencent.com/api/skills?page=1&pageSize=24".to_string();
    if !query.is_empty() {
        url.push_str("&keyword=");
        url.push_str(&urlencoding::encode(&query));
    }

    let json = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Remote search failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Remote search failed: {e}"))?
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("Invalid search response: {e}"))?;

    if json.get("code").and_then(|v| v.as_i64()) != Some(0) {
        let msg = json
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("SkillHub search returned an error.");
        return Err(msg.to_string());
    }

    let items = json
        .get("data")
        .and_then(|v| v.get("skills"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut results = items
        .into_iter()
        .filter_map(|item| {
            let slug = item.get("slug")?.as_str()?.to_string();
            let name = item
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or(&slug)
                .to_string();
            let description = item
                .get("description_zh")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .or_else(|| item.get("description").and_then(|v| v.as_str()))
                .unwrap_or("This remote skill has no summary yet.")
                .to_string();
            let owner = item
                .get("ownerName")
                .and_then(|v| v.as_str())
                .map(|v| v.to_string());
            let downloads = item
                .get("downloads")
                .and_then(|v| v.as_u64())
                .or_else(|| item.get("installs").and_then(|v| v.as_u64()));

            Some(RemoteSkillEntry {
                id: slug.clone(),
                slug,
                name,
                description,
                source: "skillhub".to_string(),
                owner,
                downloads,
                install_mode: "Mirror".to_string(),
            })
        })
        .collect::<Vec<_>>();

    results.sort_by(|a, b| b.downloads.unwrap_or(0).cmp(&a.downloads.unwrap_or(0)));
    Ok(results)
}

#[tauri::command]
pub async fn download_remote_skill_archive(slug: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("S-Loop/0.1.0")
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let bytes = client
        .get(format!(
            "https://clawhub.ai/api/v1/download?slug={}",
            urlencoding::encode(&slug)
        ))
        .send()
        .await
        .map_err(|e| format!("Download failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Download failed: {e}"))?
        .bytes()
        .await
        .map_err(|e| format!("Failed to read archive bytes: {e}"))?;

    Ok(BASE64_STANDARD.encode(bytes))
}
