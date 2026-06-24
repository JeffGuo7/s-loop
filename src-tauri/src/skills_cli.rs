use serde::{Deserialize, Serialize};
use std::process::Command;

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

fn get_github_mirror_url() -> Option<String> {
    std::env::var("S_LOOP_GITHUB_MIRROR").ok()
}

fn dirs_home() -> String {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string())
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

// ─── Skills CLI commands ───

/// Search skills via skills.sh API (supports mirror)
#[tauri::command]
pub async fn skills_cli_search(query: String) -> Result<Vec<SkillsSearchResult>, String> {
    let api_base = get_skills_api_url();
    let encoded = percent_encode(&query);
    let url = format!("{}/api/search?q={}&limit=20", api_base, encoded);

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

/// Build the source argument for skills CLI, applying mirror if configured
fn build_source_arg(source: &str) -> String {
    if let Some(mirror) = get_github_mirror_url() {
        let mirror = mirror.trim_end_matches('/');
        // If source is owner/repo shorthand, prepend mirror
        if source.contains('/') && !source.starts_with("http") && !source.starts_with("git@") {
            format!("{}/{}", mirror, source)
        } else {
            source.to_string()
        }
    } else {
        source.to_string()
    }
}

/// Install a skill via npx skills CLI
#[tauri::command]
pub async fn skills_cli_install(
    source: String,
    skill_name: Option<String>,
) -> Result<SkillInstallResult, String> {
    let effective_source = build_source_arg(&source);

    let mut args = vec![
        "skills".to_string(),
        "add".to_string(),
        effective_source.clone(),
        "--agent".to_string(),
        "pi".to_string(),
        "-g".to_string(),
        "-y".to_string(),
    ];

    if let Some(ref name) = skill_name {
        args.push("--skill".to_string());
        args.push(name.clone());
    }

    // Pass mirror API URL via env if configured
    let api_url = get_skills_api_url();

    let output = Command::new("npx")
        .args(&args)
        .env("SKILLS_API_URL", &api_url)
        .output()
        .map_err(|e| {
            format!("Failed to run npx skills: {e}. Is Node.js installed?")
        })?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Ok(SkillInstallResult {
            success: false,
            message: format!("Installation failed\n---\n{}\n{}", stderr, stdout),
            skill_name: None,
            skill_path: None,
        });
    }

    let extracted_name = skill_name.clone().or_else(|| {
        for line in stdout.lines() {
            let lower = line.to_lowercase();
            if lower.contains("successfully") || lower.contains("installed") || lower.contains("added") || lower.contains("symlinked") {
                if let Some(name) = extract_skill_name_from_line(line) {
                    return Some(name);
                }
            }
        }
        None
    });

    let home = dirs_home();
    let skill_path = extracted_name.as_ref().map(|n| {
        format!("{}/.pi/agent/skills/{}", home, n)
    });

    Ok(SkillInstallResult {
        success: true,
        message: stdout,
        skill_name: extracted_name,
        skill_path,
    })
}

/// List installed skills via npx skills CLI
#[allow(dead_code)]
#[tauri::command]
pub async fn skills_cli_list(global: Option<bool>) -> Result<String, String> {
    let mut args = vec!["skills".to_string(), "list".to_string()];
    if global.unwrap_or(true) {
        args.push("-g".to_string());
    }

    let output = Command::new("npx")
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to run npx skills list: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Err(format!("List failed:\n{}\n{}", stdout, stderr));
    }

    Ok(format!("{}\n{}", stdout, stderr))
}

/// Update installed skills via npx skills CLI
#[tauri::command]
pub async fn skills_cli_update() -> Result<String, String> {
    let api_url = get_skills_api_url();

    let output = Command::new("npx")
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
    let output = Command::new("npx")
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

/// Check current mirror configuration
#[tauri::command]
pub fn skills_mirror_config() -> serde_json::Value {
    serde_json::json!({
        "api_url": get_skills_api_url(),
        "github_mirror": get_github_mirror_url(),
    })
}

// ─── Helpers ───

fn extract_skill_name_from_line(line: &str) -> Option<String> {
    let lower = line.to_lowercase();
    for prefix in &["installed ", "added ", "copied ", "symlinked "] {
        if let Some(pos) = lower.find(prefix) {
            let after = &line[pos + prefix.len()..];
            let name = after
                .split_whitespace()
                .next()
                .unwrap_or("")
                .trim_matches(|c: char| !c.is_alphanumeric() && c != '-' && c != '_');
            if !name.is_empty() {
                return Some(name.to_string());
            }
        }
    }
    None
}
