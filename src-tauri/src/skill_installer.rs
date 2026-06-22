use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Debug)]
pub struct InstalledSkillInfo {
    pub name: String,
    pub description: String,
    pub content: String,
    pub path: String,
}

/// Extract a skill ZIP to the target directory and return the parsed SKILL.md info.
/// The ZIP data is passed as base64 to avoid IPC issues with binary data.
#[tauri::command]
pub fn extract_skill_zip(
    zip_base64: String,
    target_dir: String,
    source_path_hint: Option<String>,
) -> Result<InstalledSkillInfo, String> {
    let zip_bytes = base64_decode(&zip_base64)?;

    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(&zip_bytes))
        .map_err(|e| format!("Invalid ZIP file: {}", e))?;

    let mut skill_content: Option<String> = None;
    let mut skill_path_in_zip: Option<String> = None;
    let hint_normalized = source_path_hint
        .as_ref()
        .map(|hint| hint.replace('\\', "/").to_lowercase());

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| format!("Failed to read ZIP entry: {}", e))?;
        let file_path = file.name().to_string();
        let lower = file_path.replace('\\', "/").to_lowercase();

        if lower.ends_with("skill.md") {
            if let Some(hint) = hint_normalized.as_ref() {
                if !lower.contains(hint) {
                    continue;
                }
            }
            let mut content = String::new();
            std::io::Read::read_to_string(&mut file, &mut content)
                .map_err(|e| format!("Failed to read SKILL.md from ZIP: {}", e))?;
            skill_content = Some(content);
            skill_path_in_zip = Some(file_path);
            break;
        }
    }

    let content = skill_content.ok_or_else(|| {
        if let Some(hint) = hint_normalized.as_ref() {
            format!("No SKILL.md found in ZIP archive for path hint '{}'", hint)
        } else {
            "No SKILL.md found in ZIP archive".to_string()
        }
    })?;

    let (meta, body) = parse_frontmatter(&content);
    let name = meta.get("name").cloned().unwrap_or_else(|| {
        std::path::Path::new(skill_path_in_zip.as_deref().unwrap_or("skill.md"))
            .parent()
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".to_string())
    });
    let description = meta.get("description").cloned().unwrap_or_default();

    let dest_dir = PathBuf::from(&target_dir).join(&name);
    std::fs::create_dir_all(&dest_dir).map_err(|e| format!("Failed to create skill directory: {}", e))?;

    for i in 0..archive.len() {
        let file = archive.by_index(i).map_err(|e| format!("Failed to read ZIP entry: {}", e))?;
        let file_path = file.name().to_string();

        if file.name().ends_with('/') {
            continue;
        }

        let rel_path = if let Some(p) = skill_path_in_zip.as_ref() {
            let skill_dir = std::path::Path::new(p).parent().unwrap_or(std::path::Path::new(""));
            if let Ok(rel) = std::path::Path::new(&file_path).strip_prefix(skill_dir) {
                rel.to_path_buf()
            } else {
                std::path::Path::new(&file_path).file_name().unwrap_or_default().into()
            }
        } else {
            std::path::Path::new(&file_path).file_name().unwrap_or_default().into()
        };

        let output_path = dest_dir.join(&rel_path);
        if let Some(parent) = output_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }

        if file.size() > 0 {
            use std::io::BufReader;
            let mut reader = BufReader::new(file);
            let mut output_file = std::fs::File::create(&output_path)
                .map_err(|e| format!("Failed to create output file: {}", e))?;
            std::io::copy(&mut reader, &mut output_file)
                .map_err(|e| format!("Failed to write file: {}", e))?;
        } else {
            std::fs::write(&output_path, b"").ok();
        }
    }

    Ok(InstalledSkillInfo {
        name,
        description,
        content: body,
        path: dest_dir.to_string_lossy().to_string(),
    })
}

fn parse_frontmatter(content: &str) -> (std::collections::HashMap<String, String>, String) {
    let mut meta = std::collections::HashMap::new();
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

fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    use base64::Engine as _;
    base64::engine::general_purpose::STANDARD
        .decode(input)
        .map_err(|e| format!("Base64 decode error: {}", e))
}
