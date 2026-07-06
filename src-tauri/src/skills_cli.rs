use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;

/// Search result from skills.sh API
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SkillsSearchResult {
    pub id: String,
    pub name: String,
    pub source: String,
    pub installs: i64,
}

/// Skills.sh API response wrapper
#[derive(Deserialize)]
struct SkillsSearchResponse {
    skills: Vec<SkillsSearchResult>,
}

/// Result of a skills CLI installation
#[derive(Serialize, Clone, Debug)]
pub struct SkillInstallResult {
    pub success: bool,
    pub message: String,
    pub skill_name: Option<String>,
    pub skill_path: Option<String>,
}

// ─── Mirror configuration ───

fn get_skills_api_url() -> String {
    std::env::var("S_LOOP_SKILLS_API_URL")
        .unwrap_or_else(|_| "https://skills.sh".to_string())
}

fn dirs_home() -> PathBuf {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

/// Replace characters that are invalid in file/directory names on any platform.
fn sanitize_dir_name(raw: &str) -> String {
    raw.chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '-',
            c if c.is_control() => '-',
            c => c,
        })
        .collect::<String>()
        .trim_matches(|c: char| c == '.' || c == ' ')
        .to_string()
}

fn percent_encode(query: &str) -> String {
    let mut result = String::new();
    for byte in query.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9'
            | b'-' | b'_' | b'.' | b'~' => result.push(byte as char),
            b' ' => result.push_str("%20"),
            _ => result.push_str(&format!("%{:02X}", byte)),
        }
    }
    result
}

// ─── npx resolution (cross-platform — GUI apps may not inherit user PATH) ───

/// Find the npx executable by searching common installation paths.
/// GUI apps on all platforms may not inherit shell-configured PATH.
fn find_npx_cmd() -> Option<PathBuf> {
    let npx_name = if cfg!(target_os = "windows") {
        "npx.cmd"
    } else {
        "npx"
    };

    // 1. Try the system's command locator
    let locator = if cfg!(target_os = "windows") { "where" } else { "which" };
    if let Ok(output) = Command::new(locator).arg(npx_name).output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        if let Some(line) = stdout.lines().next() {
            let p = line.trim();
            if !p.is_empty() && std::path::Path::new(p).exists() {
                return Some(PathBuf::from(p));
            }
        }
    }

    // 2. Search common Node.js install directories (cross-platform)
    let home = dirs_home();
    let candidates: Vec<PathBuf> = if cfg!(target_os = "windows") {
        vec![
            r"C:\Program Files\nodejs\npx.cmd".into(),
            r"C:\Program Files (x86)\nodejs\npx.cmd".into(),
            home.join("AppData").join("Roaming").join("npm").join("npx.cmd"),
        ]
    } else {
        vec![
            // Homebrew (Intel Mac)
            "/usr/local/bin/npx".into(),
            // Homebrew (Apple Silicon Mac)
            "/opt/homebrew/bin/npx".into(),
            // System
            "/usr/bin/npx".into(),
            // Volta (cross-platform version manager)
            home.join(".volta").join("bin").join("npx"),
            // fnm (cross-platform version manager)
            home.join(".local").join("share").join("fnm").join("node-versions"),
        ]
    };

    for candidate in &candidates {
        if candidate.exists() {
            return Some(candidate.clone());
        }
    }

    // 3. Search for node and derive npx path
    if let Ok(output) = Command::new(locator).arg(if cfg!(target_os = "windows") { "node.exe" } else { "node" }).output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            let node_path = PathBuf::from(line.trim());
            if let Some(parent) = node_path.parent() {
                let npx = parent.join(npx_name);
                if npx.exists() {
                    return Some(npx);
                }
            }
        }
    }

    // 4. nvm: search ~/.nvm/versions/node/*/bin/npx
    let nvm_versions = home.join(".nvm").join("versions").join("node");
    if nvm_versions.exists() {
        if let Ok(entries) = std::fs::read_dir(&nvm_versions) {
            for entry in entries.flatten() {
                let npx = entry.path().join("bin").join("npx");
                if npx.exists() {
                    return Some(npx);
                }
            }
        }
    }

    None
}

/// Build a Command for npx, using resolved path when available
fn npx_command() -> Command {
    if let Some(npx_path) = find_npx_cmd() {
        Command::new(npx_path)
    } else {
        Command::new("npx")
    }
}

// ─── Skills CLI commands ───

/// Search skills via skills.sh API (supports mirror)
#[tauri::command]
pub async fn skills_cli_search(query: String) -> Result<Vec<SkillsSearchResult>, String> {
    let api_base = get_skills_api_url();
    let encoded = percent_encode(&query);
    let url = format!("{}/api/search?q={}&limit=24", api_base, encoded);

    let client = reqwest::Client::builder()
        .user_agent("S-Loop/0.1.0")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let res = client.get(&url).send().await.map_err(|e| format!("Search request failed: {e}"))?;

    if !res.status().is_success() {
        return Err(format!("Search API returned status {}", res.status()));
    }

    let data = res
        .json::<SkillsSearchResponse>()
        .await
        .map_err(|e| format!("Failed to parse search response: {e}"))?;

    let mut skills = data.skills;
    skills.sort_by(|a, b| b.installs.cmp(&a.installs));
    Ok(skills)
}

/// Update installed skills via npx skills CLI
#[tauri::command]
pub async fn skills_cli_update() -> Result<String, String> {
    let api_url = get_skills_api_url();

    let output = npx_command()
        .args(["skills", "update", "-y"])
        .env("SKILLS_API_URL", &api_url)
        .output()
        .map_err(|e| format!("Failed to run npx skills update: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Err(format!("Update failed:\n{}\n{}", stdout, stderr));
    }

    Ok(stdout)
}

/// Remove a skill via npx skills CLI
#[tauri::command]
pub async fn skills_cli_remove(skill_name: String) -> Result<String, String> {
    let output = npx_command()
        .args([
            "skills",
            "remove",
            &skill_name,
            "--agent",
            "pi",
            "-g",
            "-y",
        ])
        .output()
        .map_err(|e| format!("Failed to run npx skills remove: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Err(format!("Remove failed:\n{}\n{}", stdout, stderr));
    }

    Ok(stdout)
}

/// Delete a skill's directory from disk.
/// First tries the skill's actual location (extracted from the stored path),
/// then falls back to ~/.pi/agent/skills/{name}/.
#[tauri::command]
pub fn delete_skill_files(skill_name: String, skill_path: Option<String>) -> Result<String, String> {
    // Try the actual skill path first (from the stored location)
    if let Some(ref loc) = skill_path {
        let loc_path = std::path::Path::new(loc);
        // If loc is a SKILL.md file path, delete its parent directory
        let dir_to_delete = if loc_path.is_file()
            || loc_path.extension().map(|e| e == "md").unwrap_or(false)
        {
            loc_path.parent().map(|p| p.to_path_buf())
        } else {
            Some(loc_path.to_path_buf())
        };

        if let Some(dir) = dir_to_delete {
            if dir.exists() {
                std::fs::remove_dir_all(&dir)
                    .map_err(|e| format!("Failed to delete skill directory {}: {}", dir.display(), e))?;
                return Ok(format!("Deleted skill directory: {}", dir.display()));
            }
        }
    }

    // Fallback: try ~/.pi/agent/skills/{name}/
    let dir = dirs_home().join(".pi").join("agent").join("skills").join(&skill_name);
    if dir.exists() {
        std::fs::remove_dir_all(&dir)
            .map_err(|e| format!("Failed to delete skill directory: {e}"))?;
        Ok(format!("Deleted skill directory: {}", dir.display()))
    } else {
        Ok(format!("Skill directory not found for: {}", skill_name))
    }
}

/// Write a new SKILL.md file to ~/.pi/agent/skills/{name}/SKILL.md.
/// Returns the path to the created skill directory.
#[tauri::command]
pub fn create_skill_file(name: String, description: String, content: String) -> Result<String, String> {
    let safe_name = sanitize_dir_name(&name);
    let skills_dir = dirs_home().join(".pi").join("agent").join("skills");
    let skill_dir = skills_dir.join(&safe_name);
    std::fs::create_dir_all(&skill_dir)
        .map_err(|e| format!("Failed to create skill directory: {e}"))?;

    let frontmatter = format!(
        "---\nname: {}\ndescription: {}\n---\n\n{}",
        name, description, content
    );
    let skill_md = skill_dir.join("SKILL.md");
    std::fs::write(&skill_md, frontmatter)
        .map_err(|e| format!("Failed to write SKILL.md: {e}"))?;

    Ok(skill_dir.to_string_lossy().to_string())
}

/// Check current mirror configuration
#[tauri::command]
pub fn skills_mirror_config() -> serde_json::Value {
    serde_json::json!({
        "api_url": get_skills_api_url(),
    })
}

// ─── Helpers ───

/// Install a single skill from ClawHub (https://clawhub.ai).
/// Downloads the ZIP archive and extracts it to ~/.pi/agent/skills/{name}/.
/// No npx, no git, no Node.js required.
#[tauri::command]
pub async fn clawhub_install_skill(
    slug: String,
    skill_name: Option<String>,
) -> Result<SkillInstallResult, String> {
    let client = reqwest::Client::builder()
        .user_agent("S-Loop/0.1.0")
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let bytes = client
        .get(format!(
            "https://clawhub.ai/api/v1/download?slug={}",
            urlencoding::encode(&slug)
        ))
        .send()
        .await
        .map_err(|e| format!("ClawHub download failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("ClawHub download failed: {e}"))?
        .bytes()
        .await
        .map_err(|e| format!("Failed to read download: {e}"))?
        .to_vec();

    let cursor = Cursor::new(bytes.as_slice());
    let mut archive =
        zip::ZipArchive::new(cursor).map_err(|e| format!("Downloaded file is not a valid ZIP: {e}"))?;

    // First pass: find all SKILL.md files and their frontmatter names
    struct FoundSkill {
        base_dir: String,
        frontmatter_name: String,
    }
    let mut found_skills: Vec<FoundSkill> = Vec::new();

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read ZIP entry: {e}"))?;
        let path = entry.name().to_string();
        let lower = path.replace('\\', "/").to_lowercase();

        if !lower.ends_with("skill.md") {
            continue;
        }

        let mut content = String::new();
        std::io::Read::read_to_string(&mut entry, &mut content)
            .map_err(|e| format!("Failed to read SKILL.md: {e}"))?;

        let (meta, _body) = crate::commands::parse_frontmatter(&content);
        let frontmatter_name = meta.get("name").cloned().unwrap_or_else(|| {
            std::path::Path::new(&path)
                .parent()
                .and_then(|p| p.file_name())
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| slug.clone())
        });

        let base_dir = std::path::Path::new(&path)
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .map(|p| format!("{}/", p.to_string_lossy()))
            .unwrap_or_default();

        found_skills.push(FoundSkill { base_dir, frontmatter_name });
    }

    if found_skills.is_empty() {
        return Err("No SKILL.md found in the downloaded archive.".to_string());
    }

    // Select the right skill: match by skill_name, or take the first one
    let selected = if let Some(ref filter) = skill_name {
        let lower_filter = filter.to_lowercase();
        found_skills
            .iter()
            .find(|s| s.frontmatter_name.to_lowercase() == lower_filter)
            .or_else(|| found_skills.first())
    } else {
        found_skills.first()
    };

    let selected = selected.ok_or("No skill found in archive.")?;
    let skill_base_dir = &selected.base_dir;

    // Use the frontmatter name — it's what refreshSkills will produce.
    // The user-provided skill_name is only used for filtering which SKILL.md to pick.
    let display_name = selected.frontmatter_name.clone();
    let dir_name = sanitize_dir_name(&display_name);

    // Install to ~/.pi/agent/skills/{dir_name}/
    let skills_dir = dirs_home().join(".pi").join("agent").join("skills");
    let dest_dir = skills_dir.join(&dir_name);
    std::fs::create_dir_all(&dest_dir)
        .map_err(|e| format!("Failed to create skill directory: {e}"))?;

    // Second pass: extract all files belonging to this skill
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read ZIP entry: {e}"))?;
        let entry_path = entry.name().to_string();

        if entry.name().ends_with('/') {
            continue;
        }

        let rel_path = if skill_base_dir.is_empty() {
            std::path::Path::new(&entry_path)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default()
        } else if entry_path.starts_with(skill_base_dir) {
            entry_path[skill_base_dir.len()..].to_string()
        } else {
            continue;
        };

        if rel_path.is_empty() {
            continue;
        }

        let output = dest_dir.join(&rel_path);
        if let Some(parent) = output.parent() {
            std::fs::create_dir_all(parent).ok();
        }

        let mut buf = Vec::new();
        if std::io::Read::read_to_end(&mut entry, &mut buf).is_ok() {
            std::fs::write(&output, &buf).ok();
        }
    }

    Ok(SkillInstallResult {
        success: true,
        message: format!("Installed {} from ClawHub", display_name),
        skill_name: Some(display_name),
        skill_path: Some(skills_dir.to_string_lossy().to_string()),
    })
}
