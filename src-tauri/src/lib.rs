//! Tauri commands bridging the React frontend to config, ranks and Data Dragon.

mod config;
mod ddragon;
mod riot;

use std::collections::HashMap;

use config::Config;
use tauri::Emitter;

/// Everything the first paint needs, read from disk. No network here — the app
/// must be usable before any request completes.
#[derive(serde::Serialize)]
pub struct Bootstrap {
    config: Config,
    ranks: HashMap<String, String>,
    has_api_key: bool,
    champions: ddragon::ChampionData,
    /// Absolute path to the portrait cache, for the frontend to turn into
    /// asset:// URLs via convertFileSrc.
    portrait_dir: String,
}

#[tauri::command]
fn bootstrap() -> Bootstrap {
    Bootstrap {
        config: config::load(),
        ranks: config::load_ranks(),
        has_api_key: !config::resolve_api_key().is_empty(),
        champions: ddragon::cached(),
        portrait_dir: ddragon::portrait_dir().to_string_lossy().into_owned(),
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
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![bootstrap, save_config, fetch_ranks])
        .setup(|app| {
            // Champion data refresh, detached so it can never delay the window.
            // Emits only when something actually changed, so the UI redraws on
            // a new patch but stays still on the common no-op case.
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
