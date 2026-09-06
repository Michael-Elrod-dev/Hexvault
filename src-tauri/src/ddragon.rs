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

fn manifest_path() -> PathBuf {
    app_dir().join("portraits.json")
}

/// Records which build of each portrait is on disk.
///
/// Data Dragon serves the ETag as the content MD5, so comparing it against the
/// stored value detects a champion whose art was updated even though its name
/// and id are unchanged -- a visual rework, which a file-exists check misses.
#[derive(Debug, Default, Serialize, Deserialize)]
struct PortraitManifest {
    #[serde(default)]
    version: String,
    #[serde(default)]
    etags: HashMap<String, String>,
}

fn load_manifest() -> PortraitManifest {
    fs::read_to_string(manifest_path())
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
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

/// What revalidating one cached portrait concluded.
enum Verdict {
    /// Cached copy is current.
    Keep,
    /// Cached bytes look right; record the ETag so later checks are exact.
    Adopt(String),
    /// Art changed, or we cannot prove it did not.
    Refetch,
}

fn portrait_url(version: &str, id: &str) -> String {
    format!("https://ddragon.leagueoflegends.com/cdn/{version}/img/champion/{id}.png")
}

/// Fetch portraits that are missing or out of date.
///
/// Missing files are always fetched. When the Data Dragon version has moved on,
/// every cached portrait is revalidated with a HEAD request and re-fetched only
/// if its ETag changed, so a visual rework is picked up without re-downloading
/// the whole set. While the version is unchanged nothing is requested at all --
/// asset URLs are version-scoped and immutable.
async fn sync_portraits(
    client: &reqwest::Client,
    version: &str,
    champions: &[Champion],
) -> usize {
    let dir = portrait_dir();
    if fs::create_dir_all(&dir).is_err() {
        return 0;
    }

    let mut manifest = load_manifest();
    let revalidate = manifest.version != version;

    let mut stale: Vec<&Champion> = Vec::new();
    let mut present: Vec<&Champion> = Vec::new();
    for champion in champions {
        if dir.join(format!("{}.png", champion.id)).exists() {
            present.push(champion);
        } else {
            stale.push(champion);
        }
    }

    if revalidate {
        for batch in present.chunks(PORTRAIT_CONCURRENCY) {
            let checks = batch.iter().map(|champion| {
                let client = client.clone();
                let url = portrait_url(version, &champion.id);
                let known = manifest.etags.get(&champion.id).cloned();
                let local_len = fs::metadata(dir.join(format!("{}.png", champion.id)))
                    .map(|m| m.len())
                    .unwrap_or(0);
                async move {
                    let Ok(response) = client.head(&url).send().await else {
                        // Offline: keep what is on disk rather than discarding it.
                        return Verdict::Keep;
                    };
                    let headers = response.headers();
                    let etag = headers
                        .get(reqwest::header::ETAG)
                        .and_then(|v| v.to_str().ok())
                        .map(|s| s.to_string());
                    let remote_len = headers
                        .get(reqwest::header::CONTENT_LENGTH)
                        .and_then(|v| v.to_str().ok())
                        .and_then(|v| v.parse::<u64>().ok());

                    match (known, etag) {
                        (Some(known), Some(fresh)) if known == fresh => Verdict::Keep,
                        // No stored ETag yet: adopt it without re-downloading
                        // when the cached file is already the right size, so
                        // upgrading does not refetch the whole set.
                        (None, Some(fresh)) if remote_len == Some(local_len) && local_len > 0 => {
                            Verdict::Adopt(fresh)
                        }
                        _ => Verdict::Refetch,
                    }
                }
            });
            let verdicts = futures::future::join_all(checks).await;
            for (champion, verdict) in batch.iter().zip(verdicts) {
                match verdict {
                    Verdict::Keep => {}
                    Verdict::Adopt(etag) => {
                        manifest.etags.insert(champion.id.clone(), etag);
                    }
                    Verdict::Refetch => stale.push(champion),
                }
            }
        }
    }

    let mut downloaded = 0usize;
    for batch in stale.chunks(PORTRAIT_CONCURRENCY) {
        let jobs = batch.iter().map(|champion| {
            let client = client.clone();
            let dir = dir.clone();
            let id = champion.id.clone();
            let url = portrait_url(version, &id);
            async move {
                let Ok(response) = client.get(&url).send().await else { return None };
                if !response.status().is_success() {
                    return None;
                }
                let etag = response
                    .headers()
                    .get(reqwest::header::ETAG)
                    .and_then(|v| v.to_str().ok())
                    .map(|s| s.to_string());
                let Ok(bytes) = response.bytes().await else { return None };
                // Write to a temp name then rename, so a half-written PNG is
                // never visible to the webview.
                let final_path = dir.join(format!("{id}.png"));
                let tmp = dir.join(format!(".{id}.png.tmp"));
                if fs::write(&tmp, &bytes).is_err() {
                    return None;
                }
                if fs::rename(&tmp, &final_path).is_err() {
                    let _ = fs::remove_file(&tmp);
                    return None;
                }
                Some((id, etag))
            }
        });
        for result in futures::future::join_all(jobs).await.into_iter().flatten() {
            let (id, etag) = result;
            if let Some(etag) = etag {
                manifest.etags.insert(id, etag);
            }
            downloaded += 1;
        }
    }

    manifest.version = version.to_string();
    if let Ok(json) = serde_json::to_string_pretty(&manifest) {
        let _ = atomic_write(&manifest_path(), &json);
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
