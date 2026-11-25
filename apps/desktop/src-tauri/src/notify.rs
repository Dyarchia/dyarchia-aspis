use std::fs;

use windows::{
    Data::Xml::Dom::XmlDocument,
    UI::Notifications::{ToastNotification, ToastNotificationManager},
    core::HSTRING,
};

use crate::hook::home;

const APP_ID: &str = "com.dyarchia.aspis";
const ICON: &[u8] = include_bytes!("../icons/128x128.png");

fn escape(text: &str) -> String {
    text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

/*
 * `dyarchia-aspis.exe --notify <title> [line...]`, called by the dispatcher when an auditor gives its verdict or
 * cannot run. A reminder toast stays on screen until it is dismissed and plays the reminder sound; the aspis
 * shield is written once next to state.db so the toast can show it. It works with the app closed, because the
 * installer registered the app id on its Start menu shortcut.
 */
pub fn run(args: &[String]) -> i32 {
    let Some((title, lines)) = args.split_first() else { return 1 };
    let icon = home().map(|home| home.join("assets").join("toast.png"));
    if let Some(icon) = &icon {
        if !icon.exists() {
            let _ = icon.parent().map(fs::create_dir_all);
            let _ = fs::write(icon, ICON);
        }
    }
    let logo = icon
        .filter(|icon| icon.exists())
        .map(|icon| format!(r#"<image placement="appLogoOverride" src="file:///{}"/>"#, escape(&icon.to_string_lossy().replace('\\', "/"))))
        .unwrap_or_default();
    let body: String = lines.iter().map(|line| format!("<text>{}</text>", escape(line))).collect();
    let xml = format!(
        r#"<toast scenario="reminder" duration="long"><visual><binding template="ToastGeneric"><text>{}</text>{body}<text placement="attribution">Dyarchia Aspis</text>{logo}</binding></visual><actions><action activationType="system" arguments="dismiss" content=""/></actions><audio src="ms-winsoundevent:Notification.Reminder"/></toast>"#,
        escape(title)
    );
    let shown = (|| -> windows::core::Result<()> {
        let document = XmlDocument::new()?;
        document.LoadXml(&HSTRING::from(xml))?;
        let toast = ToastNotification::CreateToastNotification(&document)?;
        ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(APP_ID))?.Show(&toast)
    })();
    i32::from(shown.is_err())
}
