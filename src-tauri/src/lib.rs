//! Tauri commands bridging the React frontend to config and the Riot API.

mod config;
mod riot;

use std::collections::HashMap;

use config::Config;

/// Full app state for the first paint: config, cached ranks, and whether an
/// API key is available. One round trip instead of three.
#[derive(serde::Serialize)]
pub struct Bootstrap {
    config: Config,
    ranks: HashMap<String, String>,
    has_api_key: bool,
}

#[tauri::command]
fn bootstrap() -> Bootstrap {
    Bootstrap {
        config: config::load(),
        ranks: config::load_ranks(),
        has_api_key: !config::resolve_api_key().is_empty(),
    }
}

#[tauri::command]
fn save_config(config: Config) -> Result<(), String> {
    config::save(&config)
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
    // Merge into the existing cache so accounts removed from this request keep
    // their last known value rather than being dropped.
    let mut cache = config::load_ranks();
    cache.extend(ranks.clone());
    let _ = config::save_ranks(&cache);
    Ok(ranks)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![bootstrap, save_config, fetch_ranks])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
