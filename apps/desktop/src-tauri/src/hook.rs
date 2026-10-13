use std::{
    env,
    io::{Read, Write},
    os::windows::process::CommandExt,
    path::PathBuf,
    process::{Command, Stdio},
};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub fn home() -> Option<PathBuf> {
    env::var_os("ASPIS_HOME")
        .map(PathBuf::from)
        .or_else(|| env::var_os("USERPROFILE").map(|profile| PathBuf::from(profile).join(".dyarchia-aspis")))
}

/*
 * The CLIs call `dyarchia-aspis.exe --hook <harness>` on every prompt, tool call and turn end of every session on
 * the machine. This GUI exe starts in milliseconds; the sidecar takes far longer. So it only hands the event to the
 * sidecar when the session holds a card (its marker file exists), when the prompt asks for dya-pickup, or when the
 * agent calls an aspis tool. Everything else is let through at once. A failure here never blocks the CLI.
 */
pub fn run(harness: &str) -> i32 {
    let mut input = String::new();
    if std::io::stdin().read_to_string(&mut input).is_err() {
        return 0;
    }
    let Ok(event) = serde_json::from_str::<serde_json::Value>(&input) else { return 0 };
    let Some(session) = event["session_id"].as_str() else { return 0 };
    let marker: String = session.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' }).collect();
    let holds = home().is_some_and(|home| home.join("sessions").join(marker).exists());
    let asks = event["prompt"].as_str().is_some_and(|prompt| prompt.contains("dya-pickup"));
    let acts = event["tool_name"].as_str().is_some_and(|tool| tool.contains("aspis"));
    if !(holds || asks || acts) {
        return 0;
    }
    let Ok(exe) = env::current_exe() else { return 0 };
    let Ok(mut child) = Command::new(exe.with_file_name("aspis-server.exe"))
        .args(["hook", "--harness", harness])
        .stdin(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
    else {
        return 0;
    };
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(input.as_bytes());
    }
    child.wait().map_or(0, |status| status.code().unwrap_or(0))
}
