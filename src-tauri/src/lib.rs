//! Tauri commands bridging the React frontend to config, ranks and Data Dragon.

mod config;
mod ddragon;
mod riot;
mod secret;

use std::collections::HashMap;

use config::Config;
use tauri::{Emitter, Manager};

/// How long a copied value stays on the clipboard.
const CLIPBOARD_TTL_SECS: u64 = 30;

/// Everything the first paint needs, read from disk. No network.
#[derive(serde::Serialize)]
pub struct Bootstrap {
    config: Config,
    ranks: HashMap<String, String>,
    has_api_key: bool,
    champions: ddragon::ChampionData,
    /// Absolute path to the portrait cache, for the frontend to turn into
    /// asset:// URLs via convertFileSrc.
    portrait_dir: String,
    /// Message for the user when the saved config needed attention.
    warning: Option<String>,
}

/// Read the config, rewriting a plaintext file as encrypted and preserving one
/// that cannot be read. The second value is a message for the user.
fn read_config() -> (Config, Option<String>) {
    let path = config::config_path();
    match config::load() {
        Ok(loaded) if loaded.migrated_from_v1 => {
            let warning = config::save_to(&path, &loaded.config, false)
                .err()
                .map(|e| format!("Saved accounts could not be encrypted ({e})."));
            // A plaintext backup must not outlive the upgrade.
            let _ = std::fs::remove_file(path.with_extension("json.bak"));
            (loaded.config, warning)
        }
        Ok(loaded) => (loaded.config, None),
        Err(config::LoadError::Unreadable(reason)) => {
            let warning = match config::quarantine(&path) {
                Some(kept) => format!(
                    "Saved accounts could not be read ({reason}). The file was kept as {}.",
                    kept.file_name().unwrap_or_default().to_string_lossy()
                ),
                None => format!(
                    "Saved accounts could not be read ({reason}). Keeping the old file failed."
                ),
            };
            (Config::default(), Some(warning))
        }
    }
}

#[tauri::command]
fn bootstrap() -> Bootstrap {
    let (config, warning) = read_config();
    Bootstrap {
        config,
        ranks: config::load_ranks(),
        has_api_key: !config::resolve_api_key().is_empty(),
        champions: ddragon::cached(),
        portrait_dir: ddragon::portrait_dir().to_string_lossy().into_owned(),
        warning,
    }
}

#[tauri::command]
fn save_config(config: Config) -> Result<(), String> {
    config::save(&config)
}

/// Put text on the clipboard, kept out of clipboard history and cloud sync.
#[cfg(windows)]
fn write_clipboard(text: &str) -> Result<(), String> {
    use arboard::SetExtWindows;
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard
        .set()
        .exclude_from_history()
        .exclude_from_cloud()
        .text(text.to_string())
        .map_err(|e| e.to_string())
}

#[cfg(not(windows))]
fn write_clipboard(text: &str) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text.to_string()).map_err(|e| e.to_string())
}

/// Drop the clipboard only if it still holds what we put there, so a value the
/// user copied somewhere else is never wiped.
fn clear_clipboard_if_unchanged(text: &str) {
    let Ok(mut clipboard) = arboard::Clipboard::new() else { return };
    if clipboard.get_text().is_ok_and(|current| current == text) {
        let _ = clipboard.clear();
    }
}

/// Copy text with clipboard history and cloud sync excluded, then clear it
/// after CLIPBOARD_TTL_SECS if it is still what we put there.
#[tauri::command]
fn copy_text(text: String) -> Result<(), String> {
    write_clipboard(&text)?;
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(CLIPBOARD_TTL_SECS)).await;
        clear_clipboard_if_unchanged(&text);
    });
    Ok(())
}

/// Look up every account's rank concurrently. The API key is read here and
/// never crosses into the webview.
#[tauri::command]
async fn fetch_ranks(accounts: Vec<config::Account>) -> Result<HashMap<String, String>, String> {
    let api_key = config::resolve_api_key();
    if api_key.is_empty() {
        return Err("No API key. Set RIOT_API_KEY or add it to .env".into());
    }
    let ranks = riot::fetch_all(&api_key, &accounts).await;
    // Merge into the existing cache so accounts absent from this request keep
    // their last known value.
    let mut cache = config::load_ranks();
    cache.extend(ranks.clone());
    let _ = config::save_ranks(&cache);
    Ok(ranks)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![bootstrap, save_config, fetch_ranks, copy_text])
        .setup(|app| {
            // The portrait cache is the only directory the webview may read
            // through the asset protocol.
            app.asset_protocol_scope()
                .allow_directory(ddragon::portrait_dir(), false)
                .map_err(|e| e.to_string())?;

            // Restore saved window geometry, clamped to the current monitor.
            if let Some(window) = app.get_webview_window("main") {
                let saved = config::load().map(|l| l.config).unwrap_or_default().window;
                if let Ok(Some(monitor)) = window.current_monitor() {
                    let bounds = monitor.size();
                    let scale = monitor.scale_factor();
                    let max_w = (bounds.width as f64 / scale) as u32;
                    let max_h = (bounds.height as f64 / scale) as u32;
                    let width = saved.width.clamp(380, max_w);
                    let height = saved.height.clamp(400, max_h);
                    let _ = window.set_size(tauri::LogicalSize::new(width, height));

                    if let (Some(x), Some(y)) = (saved.x, saved.y) {
                        let fits_x = x > -(width as i32) && x < max_w as i32;
                        let fits_y = y >= 0 && y < max_h as i32;
                        if fits_x && fits_y {
                            let _ = window.set_position(tauri::LogicalPosition::new(x, y));
                        } else {
                            let _ = window.center();
                        }
                    }
                }
            }

            // Background champion data refresh. Emits only when something changed.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match ddragon::refresh().await {
                    Ok(outcome) if outcome.changed => {
                        let _ = handle.emit("champions-updated", &outcome.data);
                    }
                    Ok(_) => {}
                    Err(e) => eprintln!("champion refresh failed, using cache: {e}"),
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
