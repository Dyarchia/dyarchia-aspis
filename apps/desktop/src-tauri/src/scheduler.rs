use std::{env, os::windows::process::CommandExt, process::Command};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/*
 * Task Scheduler (one entry per Scheduled card, at its time) and the server, the MCP server and the dispatcher
 * themselves (when work is due right now) start `dyarchia-aspis.exe --dispatch`. This exe is a GUI binary, so
 * nothing flashes on screen; it runs the sidecar's dispatch command without a console window and waits for it.
 * The sidecar runs what is due and stays alive until those runs end, so a run never depends on the app being open.
 */
pub fn dispatch() -> i32 {
    let Ok(exe) = env::current_exe() else { return 1 };
    Command::new(exe.with_file_name("aspis-server.exe"))
        .arg("dispatch")
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_or(1, |status| status.code().unwrap_or(1))
}
