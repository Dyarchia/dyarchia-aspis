use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, State, Url};
use tauri_plugin_updater::{Update, UpdaterExt};

const RELEASES: &str = "https://github.com/Dyarchia/dyarchia-aspis/releases/download/";

#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<Update>>);

#[derive(Serialize)]
pub struct UpdateInfo {
    version: String,
    current: String,
    notes: Option<String>,
}

/*
 * Every release is an alpha prerelease and GitHub's "latest" ignores those, so the UI finds the newest tag
 * through the GitHub API and hands over that release's latest.json. Only manifests of this repository are
 * accepted; the signature check against the bundled public key is what makes the payload trustworthy.
 */
#[tauri::command]
pub async fn check_update(app: AppHandle, pending: State<'_, PendingUpdate>, manifest: String) -> Result<Option<UpdateInfo>, String> {
    if !manifest.starts_with(RELEASES) || !manifest.ends_with("/latest.json") {
        return Err("the update manifest must be a latest.json of this repository".into());
    }
    let url = Url::parse(&manifest).map_err(|e| e.to_string())?;
    let update = app
        .updater_builder()
        .endpoints(vec![url])
        .map_err(|e| e.to_string())?
        .on_before_exit(crate::stop_sidecar_for(app.clone()))
        .build()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;
    let info = update.as_ref().map(|u| UpdateInfo {
        version: u.version.clone(),
        current: u.current_version.clone(),
        notes: u.body.clone(),
    });
    *pending.0.lock().expect("update lock") = update;
    Ok(info)
}

#[tauri::command]
pub async fn install_update(pending: State<'_, PendingUpdate>) -> Result<(), String> {
    let update = pending.0.lock().expect("update lock").take().ok_or("no update is pending")?;
    update.download_and_install(|_, _| {}, || {}).await.map_err(|e| e.to_string())
}
