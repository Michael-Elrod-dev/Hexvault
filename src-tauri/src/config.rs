//! Config and rank-cache persistence.
//!
//! Everything lives in `%APPDATA%\Hexvault\` so it survives rebuilds and does
//! not depend on the process working directory.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Once;

use serde::{Deserialize, Serialize};

/// `%APPDATA%\Hexvault` on Windows, `~/.config/Hexvault` elsewhere.
pub fn app_dir() -> PathBuf {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .or_else(|| dirs_home().map(|h| h.join(".config")))
        .unwrap_or_else(|| PathBuf::from("."));
    let dir = base.join("Hexvault");

    // The app shipped as LoL-Info before the rename. Carry that directory over
    // once, so an upgrade does not silently orphan someone's accounts, cached
    // ranks and portraits behind a name they no longer have a reason to look
    // under. Only ever moves into a name that is not already taken, and a
    // failed rename is not fatal: the app just starts empty at the new path.
    static MIGRATED: Once = Once::new();
    MIGRATED.call_once(|| {
        let legacy = base.join("LoLinfo");
        if legacy.is_dir() && !dir.exists() {
            let _ = fs::rename(&legacy, &dir);
        }
    });

    dir
}

fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
}

pub fn config_path() -> PathBuf {
    app_dir().join("config.json")
}

pub fn rank_cache_path() -> PathBuf {
    app_dir().join("ranks.json")
}

/// Directories searched for a `.env`, nearest first: next to the executable,
/// then the app data dir.
fn env_search_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            roots.push(dir.to_path_buf());
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        roots.push(cwd);
    }
    roots.push(app_dir());
    roots
}

fn read_dotenv(path: &Path) -> Option<String> {
    let text = fs::read_to_string(path).ok()?;
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let (key, value) = line.split_once('=')?;
        if key.trim() != "RIOT_API_KEY" {
            continue;
        }
        let mut value = value.trim();
        if value.len() >= 2 {
            let bytes = value.as_bytes();
            let quoted = (bytes[0] == b'"' && bytes[value.len() - 1] == b'"')
                || (bytes[0] == b'\'' && bytes[value.len() - 1] == b'\'');
            if quoted {
                value = &value[1..value.len() - 1];
            }
        }
        if !value.is_empty() {
            return Some(value.to_string());
        }
    }
    None
}

/// Riot API key, from the environment or a `.env`. Never read from or written
/// to `config.json`, so no tracked file can contain it. The key stays in the
/// Rust process and is never sent to the webview.
pub fn resolve_api_key() -> String {
    if let Ok(key) = std::env::var("RIOT_API_KEY") {
        let key = key.trim().to_string();
        if !key.is_empty() {
            return key;
        }
    }
    for root in env_search_roots() {
        if let Some(key) = read_dotenv(&root.join(".env")) {
            return key;
        }
    }
    String::new()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub riot_name: String,
    pub tag: String,
    #[serde(default)]
    pub login: String,
    #[serde(default)]
    pub password: String,
}

impl Account {
    /// Cache identity. Riot IDs are case-insensitive.
    pub fn key(&self) -> String {
        format!("{}#{}", self.riot_name.to_lowercase(), self.tag.to_lowercase())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pool {
    pub role: String,
    #[serde(default = "default_icon")]
    pub icon: String,
    #[serde(default = "default_color")]
    pub color: String,
    #[serde(default)]
    pub champions: Vec<String>,
}

fn default_icon() -> String {
    "\u{1F3AE}".to_string()
}

fn default_color() -> String {
    "#888888".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Window {
    #[serde(default = "default_width")]
    pub width: u32,
    #[serde(default = "default_height")]
    pub height: u32,
    #[serde(default)]
    pub x: Option<i32>,
    #[serde(default)]
    pub y: Option<i32>,
}

fn default_width() -> u32 {
    520
}

fn default_height() -> u32 {
    900
}

impl Default for Window {
    fn default() -> Self {
        Self { width: default_width(), height: default_height(), x: None, y: None }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default)]
    pub window: Window,
    #[serde(default)]
    pub passwords_visible: bool,
    #[serde(default)]
    pub accounts: Vec<Account>,
    #[serde(default, rename = "champion_pools")]
    pub champion_pools: Vec<Pool>,
}

fn default_version() -> u32 {
    1
}

impl Default for Config {
    fn default() -> Self {
        Self {
            version: 1,
            window: Window::default(),
            passwords_visible: false,
            accounts: Vec::new(),
            champion_pools: default_pools(),
        }
    }
}

fn default_pools() -> Vec<Pool> {
    [
        ("Jungle", "\u{1F332}", "#4ECDC4"),
        ("Mid", "\u{2694}\u{FE0F}", "#FF6B6B"),
        ("Bot", "\u{1F3F9}", "#45B7D1"),
        ("Top", "\u{26A1}", "#FFEAA7"),
        ("Support", "\u{1F6E1}\u{FE0F}", "#96CEB4"),
    ]
    .into_iter()
    .map(|(role, icon, color)| Pool {
        role: role.to_string(),
        icon: icon.to_string(),
        color: color.to_string(),
        champions: Vec::new(),
    })
    .collect()
}

/// Write through a temp file in the same directory, then rename.
///
/// `fs::rename` is atomic on Windows for same-volume moves, so an interrupted
/// write can never leave a truncated config behind.
pub fn atomic_write(path: &Path, contents: &str) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| "config path has no parent".to_string())?;
    fs::create_dir_all(parent).map_err(|e| format!("creating {}: {e}", parent.display()))?;

    let tmp = parent.join(format!(
        ".{}.tmp",
        path.file_name().and_then(|n| n.to_str()).unwrap_or("config")
    ));
    {
        let mut file = fs::File::create(&tmp).map_err(|e| format!("creating temp file: {e}"))?;
        file.write_all(contents.as_bytes()).map_err(|e| format!("writing temp file: {e}"))?;
        file.sync_all().map_err(|e| format!("syncing temp file: {e}"))?;
    }
    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("replacing {}: {e}", path.display())
    })
}

pub fn load() -> Config {
    match fs::read_to_string(config_path()).ok().and_then(|t| serde_json::from_str(&t).ok()) {
        Some(cfg) => cfg,
        None => Config::default(),
    }
}

pub fn save(config: &Config) -> Result<(), String> {
    let json = serde_json::to_string_pretty(config).map_err(|e| format!("serializing: {e}"))?;
    atomic_write(&config_path(), &json)
}

pub fn load_ranks() -> std::collections::HashMap<String, String> {
    fs::read_to_string(rank_cache_path())
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

pub fn save_ranks(ranks: &std::collections::HashMap<String, String>) -> Result<(), String> {
    let json = serde_json::to_string_pretty(ranks).map_err(|e| format!("serializing: {e}"))?;
    atomic_write(&rank_cache_path(), &json)
}
