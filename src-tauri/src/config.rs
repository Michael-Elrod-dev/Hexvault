//! Config and rank-cache persistence under `%APPDATA%\Hexvault\`.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::secret;

/// On-disk format written by every save.
const CURRENT_VERSION: u32 = 2;

/// `%APPDATA%\Hexvault` on Windows, `~/.config/Hexvault` elsewhere.
pub fn app_dir() -> PathBuf {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .or_else(|| dirs_home().map(|h| h.join(".config")))
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("Hexvault")
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

/// Directories searched for `.env`. Exe dir, then cwd, then app data dir.
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

/// Riot API key from the environment or a `.env`. Never stored in
/// `config.json` or sent to the webview.
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
    CURRENT_VERSION
}

impl Default for Config {
    fn default() -> Self {
        Self {
            version: CURRENT_VERSION,
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

/// Write to a temp file in the same directory, then rename over the target.
/// Same-volume rename is atomic on Windows. The temp file never outlives a
/// failure.
pub fn atomic_write(path: &Path, contents: &str) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| "config path has no parent".to_string())?;
    fs::create_dir_all(parent).map_err(|e| format!("creating {}: {e}", parent.display()))?;

    let tmp = parent.join(format!(
        ".{}.tmp",
        path.file_name().and_then(|n| n.to_str()).unwrap_or("config")
    ));

    let write = || -> Result<(), String> {
        {
            let mut file = fs::File::create(&tmp).map_err(|e| format!("creating temp file: {e}"))?;
            file.write_all(contents.as_bytes()).map_err(|e| format!("writing temp file: {e}"))?;
            file.sync_all().map_err(|e| format!("syncing temp file: {e}"))?;
        }
        fs::rename(&tmp, path).map_err(|e| format!("replacing {}: {e}", path.display()))
    };

    let result = write();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

/// Move a file aside under a timestamped name and return where it went. `None`
/// when the rename fails.
pub fn quarantine(path: &Path) -> Option<PathBuf> {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("config.json");
    let kept = path.with_file_name(format!("{name}.unreadable-{stamp}"));
    fs::rename(path, &kept).ok().map(|()| kept)
}

/// An account as it sits on disk. Credentials are base64 DPAPI blobs, the riot
/// ID stays plaintext because it is a public game identifier.
#[derive(Serialize, Deserialize)]
struct StoredAccount {
    riot_name: String,
    tag: String,
    #[serde(default)]
    login_enc: String,
    #[serde(default)]
    password_enc: String,
}

#[derive(Serialize, Deserialize)]
struct StoredConfig {
    version: u32,
    #[serde(default)]
    window: Window,
    #[serde(default)]
    passwords_visible: bool,
    #[serde(default)]
    accounts: Vec<StoredAccount>,
    #[serde(default, rename = "champion_pools")]
    champion_pools: Vec<Pool>,
}

pub struct Loaded {
    pub config: Config,
    /// True when the file held plaintext credentials and needs rewriting.
    pub migrated_from_v1: bool,
}

pub enum LoadError {
    /// The file exists but cannot be parsed or decrypted. Never overwrite it.
    Unreadable(String),
}

/// Read a config file. A missing file yields the defaults, a broken one an
/// error, so the caller can preserve it.
pub fn load_from(path: &Path) -> Result<Loaded, LoadError> {
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok(Loaded { config: Config::default(), migrated_from_v1: false });
        }
        Err(e) => return Err(LoadError::Unreadable(format!("reading the file: {e}"))),
    };

    let value: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| LoadError::Unreadable(format!("invalid JSON: {e}")))?;
    let version = value.get("version").and_then(|v| v.as_u64()).unwrap_or(1);

    match version {
        0..=1 => {
            let config: Config = serde_json::from_value(value)
                .map_err(|e| LoadError::Unreadable(format!("invalid config: {e}")))?;
            Ok(Loaded { config, migrated_from_v1: true })
        }
        2 => {
            let stored: StoredConfig = serde_json::from_value(value)
                .map_err(|e| LoadError::Unreadable(format!("invalid config: {e}")))?;
            // Any decryption failure fails the whole file. A partial config
            // would be saved back over the good one.
            let mut accounts = Vec::with_capacity(stored.accounts.len());
            for account in stored.accounts {
                let login = secret::unprotect(&account.login_enc).map_err(LoadError::Unreadable)?;
                let password =
                    secret::unprotect(&account.password_enc).map_err(LoadError::Unreadable)?;
                accounts.push(Account { riot_name: account.riot_name, tag: account.tag, login, password });
            }
            Ok(Loaded {
                config: Config {
                    version: CURRENT_VERSION,
                    window: stored.window,
                    passwords_visible: stored.passwords_visible,
                    accounts,
                    champion_pools: stored.champion_pools,
                },
                migrated_from_v1: false,
            })
        }
        other => Err(LoadError::Unreadable(format!("unknown config version {other}"))),
    }
}

/// Encrypt the credentials and write the file. A failure to encrypt aborts the
/// save rather than writing plaintext.
pub fn save_to(path: &Path, config: &Config, keep_backup: bool) -> Result<(), String> {
    let mut accounts = Vec::with_capacity(config.accounts.len());
    for account in &config.accounts {
        accounts.push(StoredAccount {
            riot_name: account.riot_name.clone(),
            tag: account.tag.clone(),
            login_enc: secret::protect(&account.login)?,
            password_enc: secret::protect(&account.password)?,
        });
    }

    let stored = StoredConfig {
        version: CURRENT_VERSION,
        window: config.window.clone(),
        passwords_visible: config.passwords_visible,
        accounts,
        champion_pools: config.champion_pools.clone(),
    };
    let json = serde_json::to_string_pretty(&stored).map_err(|e| format!("serializing: {e}"))?;

    // Keep the previous file. A failed copy must not block the save.
    if keep_backup && path.exists() {
        let _ = fs::copy(path, path.with_extension("json.bak"));
    }
    atomic_write(path, &json)
}

pub fn load() -> Result<Loaded, LoadError> {
    load_from(&config_path())
}

pub fn save(config: &Config) -> Result<(), String> {
    save_to(&config_path(), config, true)
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

#[cfg(test)]
mod tests {
    use super::*;

    /// Unique temp directory, deleted on drop.
    struct Temp(PathBuf);

    impl Temp {
        fn new(tag: &str) -> Self {
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let dir = std::env::temp_dir().join(format!("hexvault-test-{tag}-{nanos}"));
            fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }

        fn join(&self, name: &str) -> PathBuf {
            self.0.join(name)
        }
    }

    impl Drop for Temp {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn sample(login: &str, password: &str) -> Config {
        Config {
            accounts: vec![Account {
                riot_name: "Example".into(),
                tag: "NA1".into(),
                login: login.into(),
                password: password.into(),
            }],
            ..Config::default()
        }
    }

    #[test]
    fn missing_file_yields_defaults() {
        let temp = Temp::new("missing");
        let loaded = load_from(&temp.join("config.json")).ok().unwrap();
        assert!(!loaded.migrated_from_v1);
        assert!(loaded.config.accounts.is_empty());
    }

    #[test]
    fn v1_file_loads_as_a_migration() {
        let temp = Temp::new("v1");
        let path = temp.join("config.json");
        fs::write(
            &path,
            r#"{
              "version": 1,
              "accounts": [
                { "riot_name": "One", "tag": "NA1", "login": "login1", "password": "pw1" },
                { "riot_name": "Two", "tag": "EUW", "login": "login2", "password": "pw2" }
              ]
            }"#,
        )
        .unwrap();

        let loaded = load_from(&path).ok().unwrap();
        assert!(loaded.migrated_from_v1);
        assert_eq!(loaded.config.accounts.len(), 2);
        assert_eq!(loaded.config.accounts[0].login, "login1");
        assert_eq!(loaded.config.accounts[1].password, "pw2");
    }

    #[test]
    fn malformed_json_is_unreadable() {
        let temp = Temp::new("malformed");
        let path = temp.join("config.json");
        fs::write(&path, "{ \"version\": 2, }").unwrap();
        assert!(load_from(&path).is_err());
    }

    #[test]
    fn a_corrupt_blob_is_unreadable() {
        let temp = Temp::new("corrupt");
        let path = temp.join("config.json");
        fs::write(
            &path,
            r#"{
              "version": 2,
              "accounts": [
                { "riot_name": "One", "tag": "NA1", "login_enc": "!!not base64!!", "password_enc": "" }
              ]
            }"#,
        )
        .unwrap();
        assert!(load_from(&path).is_err());
    }

    #[test]
    fn unknown_version_is_unreadable() {
        let temp = Temp::new("future");
        let path = temp.join("config.json");
        fs::write(&path, r#"{ "version": 99 }"#).unwrap();
        assert!(load_from(&path).is_err());
    }

    #[test]
    fn quarantine_moves_the_file_aside() {
        let temp = Temp::new("quarantine");
        let path = temp.join("config.json");
        fs::write(&path, "broken").unwrap();

        let kept = quarantine(&path).unwrap();
        assert!(!path.exists());
        assert!(kept.exists());
        assert_eq!(fs::read_to_string(&kept).unwrap(), "broken");
        assert!(kept.file_name().unwrap().to_string_lossy().starts_with("config.json.unreadable-"));
    }

    #[test]
    fn a_failed_write_leaves_no_temp_file() {
        let temp = Temp::new("failed-write");
        // A non-empty directory in the target's place. The rename cannot
        // replace it, so the write fails after the temp file exists.
        let path = temp.join("config.json");
        fs::create_dir_all(&path).unwrap();
        fs::write(path.join("occupied"), "x").unwrap();

        assert!(atomic_write(&path, "{}").is_err());
        assert!(!temp.join(".config.json.tmp").exists());
    }

    #[cfg(windows)]
    #[test]
    fn save_round_trips_without_writing_plaintext() {
        let temp = Temp::new("round-trip");
        let path = temp.join("config.json");
        let login = "\u{00FC}ser\u{00DF}";
        let password = "p\u{00E4}ssw\u{00F6}rd-\u{4F60}\u{597D}";

        save_to(&path, &sample(login, password), false).unwrap();

        let text = fs::read_to_string(&path).unwrap();
        assert!(text.contains("\"version\": 2"));
        assert!(!text.contains(password));
        assert!(!text.contains(login));
        assert!(!text.contains("\"password\""));

        let loaded = load_from(&path).ok().unwrap();
        assert!(!loaded.migrated_from_v1);
        assert_eq!(loaded.config.accounts[0].login, login);
        assert_eq!(loaded.config.accounts[0].password, password);
    }

    #[cfg(windows)]
    #[test]
    fn saving_keeps_one_previous_version() {
        let temp = Temp::new("backup");
        let path = temp.join("config.json");
        let bak = temp.join("config.json.bak");

        save_to(&path, &sample("first", "pw1"), true).unwrap();
        assert!(!bak.exists());
        let first = fs::read_to_string(&path).unwrap();

        save_to(&path, &sample("second", "pw2"), true).unwrap();
        assert_eq!(fs::read_to_string(&bak).unwrap(), first);
        assert_eq!(load_from(&path).ok().unwrap().config.accounts[0].login, "second");
        assert_eq!(load_from(&bak).ok().unwrap().config.accounts[0].login, "first");
    }

    #[cfg(windows)]
    #[test]
    fn a_migration_save_writes_no_backup() {
        let temp = Temp::new("no-backup");
        let path = temp.join("config.json");
        save_to(&path, &sample("first", "pw1"), true).unwrap();
        save_to(&path, &sample("second", "pw2"), false).unwrap();
        assert!(!temp.join("config.json.bak").exists());
    }
}
