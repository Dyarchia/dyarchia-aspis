use std::ffi::c_void;

use tauri::WebviewWindow;
use windows::Win32::{
    Foundation::{COLORREF, HWND},
    Graphics::Dwm::{DWMWA_BORDER_COLOR, DWMWA_CAPTION_COLOR, DWMWINDOWATTRIBUTE, DwmSetWindowAttribute},
    UI::Controls::{SetWindowThemeAttribute, WTA_NONCLIENT, WTA_OPTIONS, WTNCA_NODRAWCAPTION, WTNCA_NODRAWICON},
};

fn colorref(hex: &str) -> Result<COLORREF, String> {
    let digits = hex.strip_prefix('#').filter(|rest| rest.len() == 6).ok_or_else(|| format!("{hex} is not #rrggbb"))?;
    let rgb = u32::from_str_radix(digits, 16).map_err(|_| format!("{hex} is not #rrggbb"))?;
    Ok(COLORREF(((rgb & 0xff) << 16) | (rgb & 0xff00) | (rgb >> 16)))
}

/*
 * The window keeps Windows' own title bar, so snapping, Snap Layouts, resizing and the system menu all stay, and
 * only its paint follows the theme: the caption takes the app's ground and the edge the line the app draws between
 * panes. The bar draws neither the icon nor the title, so only Windows' buttons show; the taskbar and Alt Tab keep
 * both, and the sidebar already names the app. Windows 10 ignores the colours and keeps its default bar.
 */
#[tauri::command]
pub fn paint_frame(window: WebviewWindow, caption: String, border: String) -> Result<(), String> {
    let hwnd = HWND(window.hwnd().map_err(|error| error.to_string())?.0 as *mut c_void);
    let paint = |attribute: DWMWINDOWATTRIBUTE, hex: &str| -> Result<(), String> {
        let color = colorref(hex)?;
        unsafe { DwmSetWindowAttribute(hwnd, attribute, std::ptr::from_ref(&color).cast(), size_of::<COLORREF>() as u32) }.map_err(|error| error.to_string())
    };
    let bare = WTA_OPTIONS { dwFlags: WTNCA_NODRAWICON | WTNCA_NODRAWCAPTION, dwMask: WTNCA_NODRAWICON | WTNCA_NODRAWCAPTION };
    unsafe { SetWindowThemeAttribute(hwnd, WTA_NONCLIENT, std::ptr::from_ref(&bare).cast(), size_of::<WTA_OPTIONS>() as u32) }.map_err(|error| error.to_string())?;
    paint(DWMWA_CAPTION_COLOR, &caption)?;
    paint(DWMWA_BORDER_COLOR, &border)
}
