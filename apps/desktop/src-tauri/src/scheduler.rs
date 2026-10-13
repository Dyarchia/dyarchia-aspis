use std::{env, fs, io, os::windows::process::CommandExt, path::Path, process::Command};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const TASK: &str = r"\Dyarchia Aspis\Dispatcher";

/*
 * Task Scheduler starts `dyarchia-aspis.exe --dispatch` every minute. This exe is a GUI binary, so nothing flashes
 * on screen; it runs the sidecar's dispatch command without a console window and waits for it. The sidecar starts
 * the due Scheduled cards and stays alive until their runs end, so a run never depends on the app being open.
 */
pub fn dispatch() -> i32 {
    let Ok(exe) = env::current_exe() else { return 1 };
    Command::new(exe.with_file_name("aspis-server.exe"))
        .arg("dispatch")
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_or(1, |status| status.code().unwrap_or(1))
}

/*
 * Registered again on every start of a release build, so the task follows the exe after an update or a move.
 * Interactive token: it runs as the signed-in user, with their PATH and their claude login. Parallel instances,
 * because a long run must not stop the next minute from starting cards in other repositories. Batteries do not
 * stop it and a missed minute runs as soon as the machine is back.
 */
pub fn register() -> io::Result<()> {
    let exe = env::current_exe()?;
    let path = env::temp_dir().join("dyarchia-aspis-dispatcher.xml");
    let mut bytes = vec![0xFF, 0xFE];
    for unit in task_xml(&exe).encode_utf16() {
        bytes.extend_from_slice(&unit.to_le_bytes());
    }
    fs::write(&path, bytes)?;
    let status = Command::new("schtasks")
        .args(["/Create", "/TN", TASK, "/F", "/XML"])
        .arg(&path)
        .creation_flags(CREATE_NO_WINDOW)
        .status();
    let _ = fs::remove_file(&path);
    if status?.success() { Ok(()) } else { Err(io::Error::other("schtasks refused the dispatcher task")) }
}

fn escape(text: &str) -> String {
    text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

fn task_xml(exe: &Path) -> String {
    format!(
        r#"<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Starts the Dyarchia Aspis Scheduled cards that are due.</Description>
    <URI>{TASK}</URI>
  </RegistrationInfo>
  <Triggers>
    <TimeTrigger>
      <Repetition>
        <Interval>PT1M</Interval>
        <StopAtDurationEnd>false</StopAtDurationEnd>
      </Repetition>
      <StartBoundary>2026-01-01T00:00:00</StartBoundary>
      <Enabled>true</Enabled>
    </TimeTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>Parallel</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>{}</Command>
      <Arguments>--dispatch</Arguments>
    </Exec>
  </Actions>
</Task>
"#,
        escape(&exe.to_string_lossy())
    )
}
