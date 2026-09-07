//! Data Dragon champion index and portrait cache. `cached()` reads from disk,
//! `refresh()` updates in the background. Version comes from versions.json.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::config::{app_dir, atomic_write};

const VERSIONS_URL: &str = "https://ddragon.leagueoflegends.com/api/versions.json";
const TIMEOUT_SECS: u64 = 20;
/// Concurrent portrait downloads.
const PORTRAIT_CONCURRENCY: usize = 12;
/// Caps on what the CDN is allowed to hand back.
const MAX_PORTRAIT_BYTES: u64 = 2 * 1024 * 1024;
const MAX_JSON_BYTES: u64 = 8 * 1024 * 1024;
const MAX_CHAMPIONS: usize = 1000;

/// Asset ids become path components, so they may only be plain ASCII words.
fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric())
}

/// Versions become URL path segments, for example `16.17.1`.
fn valid_version(version: &str) -> bool {
    !version.is_empty()
        && version.len() <= 32
        && version.chars().all(|c| c.is_ascii_digit() || c == '.')
}

pub fn champions_path() -> PathBuf {
    app_dir().join("champions.json")
}

pub fn portrait_dir() -> PathBuf {
    app_dir().join("portraits")
}

fn manifest_path() -> PathBuf {
    app_dir().join("portraits.json")
}

/// ETag of each cached portrait. Data Dragon's ETag is the content MD5, so a
/// changed ETag means changed art.
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

/// Display name and Data Dragon asset id.
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

/// Champion data from disk. Empty if the cache is missing or corrupt.
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

/// Fetch and parse a JSON body, refusing anything over `MAX_JSON_BYTES`.
async fn fetch_json<T: serde::de::DeserializeOwned>(
    client: &reqwest::Client,
    url: &str,
    what: &str,
) -> Result<T, String> {
    let response = client.get(url).send().await.map_err(|e| format!("fetching {what}: {e}"))?;
    if response.content_length().is_some_and(|len| len > MAX_JSON_BYTES) {
        return Err(format!("{what} is larger than {MAX_JSON_BYTES} bytes"));
    }
    let bytes = response.bytes().await.map_err(|e| format!("reading {what}: {e}"))?;
    if bytes.len() as u64 > MAX_JSON_BYTES {
        return Err(format!("{what} is larger than {MAX_JSON_BYTES} bytes"));
    }
    serde_json::from_slice(&bytes).map_err(|e| format!("parsing {what}: {e}"))
}

async fn latest_version(client: &reqwest::Client) -> Result<String, String> {
    let versions: Vec<String> = fetch_json(client, VERSIONS_URL, "versions").await?;
    let version = versions.into_iter().next().ok_or_else(|| "versions.json was empty".to_string())?;
    if !valid_version(&version) {
        return Err("versions.json gave an invalid version".to_string());
    }
    Ok(version)
}

async fn fetch_champions(client: &reqwest::Client, version: &str) -> Result<Vec<Champion>, String> {
    let url = format!(
        "https://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/champion.json"
    );
    let file: ChampionFile = fetch_json(client, &url, "champions").await?;

    // Ids that cannot be path components are skipped.
    let mut champions: Vec<Champion> = file
        .data
        .into_values()
        .filter(|c| valid_id(&c.id))
        .map(|c| Champion { name: c.name, id: c.id })
        .collect();
    champions.sort_by_key(|c| c.name.to_lowercase());
    champions.truncate(MAX_CHAMPIONS);
    Ok(champions)
}

/// Result of revalidating a cached portrait.
enum Verdict {
    /// Cached copy is current.
    Keep,
    /// Cached bytes match. Record the ETag for later checks.
    Adopt(String),
    /// Art changed, or we cannot prove it did not.
    Refetch,
}

fn portrait_url(version: &str, id: &str) -> String {
    format!("https://ddragon.leagueoflegends.com/cdn/{version}/img/champion/{id}.png")
}

/// Download missing portraits. On a version change, HEAD-check cached ones and
/// refetch any whose ETag changed.
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
                        // Offline. Keep the cached copy.
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
                        // No stored ETag. Adopt it if the file size matches.
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
                if response.content_length().is_some_and(|len| len > MAX_PORTRAIT_BYTES) {
                    return None;
                }
                let etag = response
                    .headers()
                    .get(reqwest::header::ETAG)
                    .and_then(|v| v.to_str().ok())
                    .map(|s| s.to_string());
                let Ok(bytes) = response.bytes().await else { return None };
                if bytes.len() as u64 > MAX_PORTRAIT_BYTES {
                    return None;
                }
                // Write to a temp name then rename, so a half-written PNG is
                // never visible to the webview.
                debug_assert!(valid_id(&id));
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
    /// True when the champion list, version, or portraits changed.
    pub changed: bool,
}

/// Fetch the newest version, champion list, and missing portraits. `Err` on
/// network failure.
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_real_champion_ids() {
        for id in ["Aatrox", "KSante", "MonkeyKing", "Belveth", "Kaisa", "Nunu"] {
            assert!(valid_id(id), "{id} should be accepted");
        }
    }

    #[test]
    fn rejects_ids_that_could_escape_the_portrait_directory() {
        for id in ["", "../x", "..", "C:/x", "C:\\x", "Aatrox.png", "a b", "/etc/passwd", "a\\b"] {
            assert!(!valid_id(id), "{id} should be rejected");
        }
        assert!(!valid_id(&"a".repeat(65)));
        assert!(valid_id(&"a".repeat(64)));
    }

    #[test]
    fn accepts_real_versions() {
        for version in ["16.17.1", "1", "14.24.1"] {
            assert!(valid_version(version), "{version} should be accepted");
        }
    }

    #[test]
    fn rejects_versions_that_are_not_numbers_and_dots() {
        for version in ["", "lolpatch_3.7", "../16.17.1", "16.17.1/x", "16 17"] {
            assert!(!valid_version(version), "{version} should be rejected");
        }
        assert!(!valid_version(&"1".repeat(33)));
    }
}
