//! Data Dragon: champion names, ids, and portrait images.
//!
//! Cache-first by design. The app never waits on the network: `cached()` reads
//! whatever is already on disk and returns instantly, while `refresh()` runs in
//! the background and emits an event only when something actually changed.
//!
//! Riot publishes assets under a version-numbered path, so the newest version
//! is read from versions.json rather than pinned — a pinned version stops
//! receiving new champions after a patch.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::config::{app_dir, atomic_write};

const VERSIONS_URL: &str = "https://ddragon.leagueoflegends.com/api/versions.json";
const TIMEOUT_SECS: u64 = 20;
/// Portraits downloaded at once. Data Dragon is a CDN and tolerates this
/// comfortably; it keeps a cold cache fill to a few seconds.
const PORTRAIT_CONCURRENCY: usize = 12;

pub fn champions_path() -> PathBuf {
    app_dir().join("champions.json")
}

pub fn portrait_dir() -> PathBuf {
    app_dir().join("portraits")
}

/// One champion, as the UI needs it: display name plus the asset id used to
/// build the portrait filename. Storing the id removes any need for a
/// name-to-id mapping table.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Champion {
    pub name: String,
    pub id: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ChampionData {
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub champions: Vec<Champion>,
}

/// Whatever is on disk. Missing or corrupt cache yields an empty set, which the
/// frontend seeds from the names already in the user's pools.
pub fn cached() -> ChampionData {
    fs::read_to_string(champions_path())
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

#[derive(Deserialize)]
struct ChampionEntry {
    id: String,
    name: String,
}

#[derive(Deserialize)]
struct ChampionFile {
    data: HashMap<String, ChampionEntry>,
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("building http client: {e}"))
}

async fn latest_version(client: &reqwest::Client) -> Result<String, String> {
    let versions: Vec<String> = client
        .get(VERSIONS_URL)
        .send()
        .await
        .map_err(|e| format!("fetching versions: {e}"))?
        .json()
        .await
        .map_err(|e| format!("parsing versions: {e}"))?;
    versions.into_iter().next().ok_or_else(|| "versions.json was empty".to_string())
}

async fn fetch_champions(client: &reqwest::Client, version: &str) -> Result<Vec<Champion>, String> {
    let url = format!(
        "https://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/champion.json"
    );
    let file: ChampionFile = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("fetching champions: {e}"))?
        .json()
        .await
        .map_err(|e| format!("parsing champions: {e}"))?;

    let mut champions: Vec<Champion> = file
        .data
        .into_values()
        .map(|c| Champion { name: c.name, id: c.id })
        .collect();
    champions.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(champions)
}

/// Download any portrait not already on disk. Existing files are left alone, so
/// a warm cache costs nothing and only new champions are fetched after a patch.
async fn sync_portraits(
    client: &reqwest::Client,
    version: &str,
    champions: &[Champion],
) -> usize {
    let dir = portrait_dir();
    if fs::create_dir_all(&dir).is_err() {
        return 0;
    }

    let missing: Vec<&Champion> = champions
        .iter()
        .filter(|c| !dir.join(format!("{}.png", c.id)).exists())
        .collect();

    let mut downloaded = 0usize;
    for batch in missing.chunks(PORTRAIT_CONCURRENCY) {
        let jobs = batch.iter().map(|champion| {
            let client = client.clone();
            let dir = dir.clone();
            let id = champion.id.clone();
            let version = version.to_string();
            async move {
                let url = format!(
                    "https://ddragon.leagueoflegends.com/cdn/{version}/img/champion/{id}.png"
                );
                let Ok(response) = client.get(&url).send().await else { return false };
                if !response.status().is_success() {
                    return false;
                }
                let Ok(bytes) = response.bytes().await else { return false };
                // Write to a temp name then rename, so a half-written PNG is
                // never visible to the webview.
                let final_path = dir.join(format!("{id}.png"));
                let tmp = dir.join(format!(".{id}.png.tmp"));
                if fs::write(&tmp, &bytes).is_err() {
                    return false;
                }
                if fs::rename(&tmp, &final_path).is_err() {
                    let _ = fs::remove_file(&tmp);
                    return false;
                }
                true
            }
        });
        downloaded += futures::future::join_all(jobs).await.into_iter().filter(|ok| *ok).count();
    }
    downloaded
}

/// Outcome of a background refresh.
pub struct RefreshOutcome {
    pub data: ChampionData,
    /// True when the champion list or version changed, or portraits were added
    /// — i.e. when the UI has something new to show.
    pub changed: bool,
}

/// Fetch the newest version, champion list, and any missing portraits.
/// Returns `Err` on network failure; callers treat that as "keep using cache".
pub async fn refresh() -> Result<RefreshOutcome, String> {
    let client = client()?;
    let version = latest_version(&client).await?;
    let champions = fetch_champions(&client, &version).await?;

    let previous = cached();
    let list_changed = previous.version != version || previous.champions != champions;

    let downloaded = sync_portraits(&client, &version, &champions).await;

    let data = ChampionData { version, champions };
    if list_changed {
        let json = serde_json::to_string_pretty(&data)
            .map_err(|e| format!("serializing champions: {e}"))?;
        atomic_write(&champions_path(), &json)?;
    }

    Ok(RefreshOutcome { data, changed: list_changed || downloaded > 0 })
}
