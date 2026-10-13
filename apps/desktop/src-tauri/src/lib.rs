mod hook;
mod scheduler;
mod update;

use std::{sync::Mutex, time::Duration};

use serde::{Deserialize, Serialize};
use tauri::{App, AppHandle, Manager, RunEvent};
use tauri_plugin_shell::{
    ShellExt,
    process::{CommandChild, CommandEvent},
};
use tokio::sync::watch;

#[derive(Clone, Serialize)]
struct ServerInfo {
    port: u16,
    token: String,
}

#[derive(Deserialize)]
struct Ready {
    port: u16,
}

struct Sidecar {
    child: Mutex<Option<CommandChild>>,
    ready: watch::Receiver<Option<ServerInfo>>,
}

#[tauri::command]
async fn server_info(sidecar: tauri::State<'_, Sidecar>) -> Result<ServerInfo, String> {
    let mut ready = sidecar.ready.clone();
    match tokio::time::timeout(Duration::from_secs(20), ready.wait_for(Option::is_some)).await {
        Ok(Ok(info)) => Ok(info.clone().expect("checked by wait_for")),
        Ok(Err(_)) => Err("the local server exited".into()),
        Err(_) => Err("the local server did not start in time".into()),
    }
}

fn token() -> String {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("system entropy");
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn stop_sidecar(app: &AppHandle) {
    if let Some(child) = app.state::<Sidecar>().child.lock().expect("sidecar lock").take() {
        let _ = child.kill();
    }
}

fn stop_sidecar_for(app: AppHandle) -> impl Fn() + Send + Sync + 'static {
    move || stop_sidecar(&app)
}

fn spawn_sidecar(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let token = token();
    let (tx, rx) = watch::channel(None);
    let (mut events, child) = app
        .shell()
        .sidecar("aspis-server")?
        .args(["serve", "--port", "0", "--parent-stdin"])
        .env("ASPIS_TOKEN", &token)
        .spawn()?;
    app.manage(Sidecar { child: Mutex::new(Some(child)), ready: rx });

    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    for line in String::from_utf8_lossy(&bytes).lines() {
                        if let Ok(Ready { port }) = serde_json::from_str(line.trim()) {
                            let _ = tx.send(Some(ServerInfo { port, token: token.clone() }));
                        }
                    }
                }
                CommandEvent::Stderr(bytes) => eprintln!("aspis-server: {}", String::from_utf8_lossy(&bytes)),
                CommandEvent::Terminated(status) => {
                    eprintln!("aspis-server exited with {:?}", status.code);
                    break;
                }
                _ => {}
            }
        }
    });
    Ok(())
}

pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|arg| arg == "--dispatch") {
        std::process::exit(scheduler::dispatch());
    }
    if let Some(at) = args.iter().position(|arg| arg == "--hook") {
        std::process::exit(hook::run(args.get(at + 1).map_or("claude-code", String::as_str)));
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(update::PendingUpdate::default())
        .setup(|app| {
            if !cfg!(debug_assertions) {
                std::thread::spawn(|| {
                    if let Err(error) = scheduler::register() {
                        eprintln!("dispatcher task: {error}");
                    }
                });
            }
            spawn_sidecar(app)
        })
        .invoke_handler(tauri::generate_handler![server_info, update::check_update, update::install_update])
        .build(tauri::generate_context!())
        .expect("failed to build the Aspis app")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                stop_sidecar(app);
            }
        });
}
