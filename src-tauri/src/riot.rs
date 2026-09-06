//! Riot API client. Runs in Rust so the API key never reaches the webview and
//! CORS does not apply. All accounts are looked up concurrently.

use std::collections::HashMap;

use futures::future::join_all;
use serde::Deserialize;

use crate::config::Account;

const ACCOUNT_URL: &str =
    "https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id";
const LEAGUE_URL: &str = "https://na1.api.riotgames.com/lol/league/v4/entries/by-puuid";
const TIMEOUT_SECS: u64 = 10;

#[derive(Deserialize)]
struct AccountResponse {
    puuid: String,
}

#[derive(Deserialize)]
struct LeagueEntry {
    #[serde(rename = "queueType")]
    queue_type: String,
    tier: Option<String>,
    rank: Option<String>,
    #[serde(rename = "leaguePoints")]
    league_points: Option<i64>,
}

/// Non-200 mapped to the display text the UI shows. `None` means success.
fn describe(status: u16, stage: &str) -> Option<&'static str> {
    match status {
        200 => None,
        404 if stage == "account" => Some("Account Not Found"),
        404 => Some("Unranked"),
        429 => Some("Rate Limited"),
        401 | 403 => Some("Invalid API Key"),
        _ => Some("API Error"),
    }
}

fn title_case(s: &str) -> String {
    let lower = s.to_lowercase();
    let mut chars = lower.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

fn solo_rank(entries: &[LeagueEntry]) -> String {
    for entry in entries {
        if entry.queue_type == "RANKED_SOLO_5x5" {
            let (Some(tier), Some(division), Some(lp)) =
                (&entry.tier, &entry.rank, entry.league_points)
            else {
                return "Data Parse Error".to_string();
            };
            return format!("{} {} \u{2022} {} LP", title_case(tier), division, lp);
        }
    }
    "Unranked".to_string()
}

async fn fetch_one(client: &reqwest::Client, api_key: &str, account: &Account) -> String {
    let url = format!(
        "{ACCOUNT_URL}/{}/{}",
        urlencoding::encode(&account.riot_name),
        urlencoding::encode(&account.tag)
    );
    let response = match client.get(&url).header("X-Riot-Token", api_key).send().await {
        Ok(r) => r,
        Err(e) if e.is_timeout() => return "Timed Out".to_string(),
        Err(_) => return "Connection Error".to_string(),
    };
    let status = response.status().as_u16();
    if let Some(problem) = describe(status, "account") {
        return if problem == "API Error" { format!("API Error ({status})") } else { problem.into() };
    }
    let puuid = match response.json::<AccountResponse>().await {
        Ok(a) => a.puuid,
        Err(_) => return "Data Parse Error".to_string(),
    };

    let url = format!("{LEAGUE_URL}/{}", urlencoding::encode(&puuid));
    let response = match client.get(&url).header("X-Riot-Token", api_key).send().await {
        Ok(r) => r,
        Err(e) if e.is_timeout() => return "Timed Out".to_string(),
        Err(_) => return "Connection Error".to_string(),
    };
    let status = response.status().as_u16();
    if let Some(problem) = describe(status, "league") {
        return if problem == "API Error" { format!("API Error ({status})") } else { problem.into() };
    }
    match response.json::<Vec<LeagueEntry>>().await {
        Ok(entries) => solo_rank(&entries),
        Err(_) => "Data Parse Error".to_string(),
    }
}

/// Look up every account concurrently. Returns account key -> rank text.
pub async fn fetch_all(api_key: &str, accounts: &[Account]) -> HashMap<String, String> {
    if api_key.is_empty() || accounts.is_empty() {
        return HashMap::new();
    }
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(TIMEOUT_SECS))
        .build()
    {
        Ok(c) => c,
        Err(_) => return HashMap::new(),
    };

    let lookups = accounts.iter().map(|account| {
        let client = &client;
        async move { (account.key(), fetch_one(client, api_key, account).await) }
    });
    join_all(lookups).await.into_iter().collect()
}
