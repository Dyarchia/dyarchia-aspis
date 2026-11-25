use tauri::WebviewWindow;
use windows::Win32::{
    Foundation::{COLORREF, HWND, LPARAM, WPARAM},
    Graphics::Dwm::{DWMWA_BORDER_COLOR, DWMWA_CAPTION_COLOR, DWMWINDOWATTRIBUTE, DwmSetWindowAttribute},
    UI::{
        Controls::{SetWindowThemeAttribute, WTA_NONCLIENT, WTA_OPTIONS, WTNCA_NODRAWCAPTION, WTNCA_NODRAWICON},
        WindowsAndMessaging::{
            GWL_EXSTYLE, GetWindowLongPtrW, ICON_BIG, ICON_SMALL, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, SendMessageW, SetWindowLongPtrW,
            SetWindowPos, WM_SETICON, WS_EX_DLGMODALFRAME,
        },
    },
};

fn colorref(hex: &str) -> Result<COLORREF, String> {
    let digits = hex.strip_prefix('#').filter(|rest| rest.len() == 6).ok_or_else(|| format!("{hex} is not #rrggbb"))?;
    let rgb = u32::from_str_radix(digits, 16).map_err(|_| format!("{hex} is not #rrggbb"))?;
    Ok(COLORREF(((rgb & 0xff) << 16) | (rgb & 0xff00) | (rgb >> 16)))
}

fn handle(window: &WebviewWindow) -> Result<HWND, String> {
    Ok(HWND(window.hwnd().map_err(|error| error.to_string())?.0))
}

/*
 * Windows 11 still draws the icon when the theme is only asked not to, so the window drops it outright: a modal
 * frame with no icon of its own has none to draw, while the taskbar and Alt Tab fall back to the one in the exe.
 * The theme hides the title.
 */
pub fn bare_caption(window: &WebviewWindow) -> Result<(), String> {
    let hwnd = handle(window)?;
    let bare = WTA_OPTIONS { dwFlags: WTNCA_NODRAWICON | WTNCA_NODRAWCAPTION, dwMask: WTNCA_NODRAWICON | WTNCA_NODRAWCAPTION };
    unsafe {
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, GetWindowLongPtrW(hwnd, GWL_EXSTYLE) | WS_EX_DLGMODALFRAME.0 as isize);
        SendMessageW(hwnd, WM_SETICON, Some(WPARAM(ICON_SMALL as usize)), Some(LPARAM(0)));
        SendMessageW(hwnd, WM_SETICON, Some(WPARAM(ICON_BIG as usize)), Some(LPARAM(0)));
        let _ = SetWindowThemeAttribute(hwnd, WTA_NONCLIENT, std::ptr::from_ref(&bare).cast(), size_of::<WTA_OPTIONS>() as u32);
        SetWindowPos(hwnd, None, 0, 0, 0, 0, SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE).map_err(|error| error.to_string())
    }
}

/*
 * The window keeps Windows' own title bar, so snapping, Snap Layouts, resizing and the system menu all stay, and
 * only its paint follows the theme: the caption takes the app's ground and the edge the line the app draws between
 * panes. Windows 10 ignores the colours and keeps its default bar.
 */
#[tauri::command]
pub fn paint_frame(window: WebviewWindow, caption: String, border: String) -> Result<(), String> {
    let hwnd = handle(&window)?;
    let paint = |attribute: DWMWINDOWATTRIBUTE, hex: &str| -> Result<(), String> {
        let color = colorref(hex)?;
        unsafe { DwmSetWindowAttribute(hwnd, attribute, std::ptr::from_ref(&color).cast(), size_of::<COLORREF>() as u32) }.map_err(|error| error.to_string())
    };
    paint(DWMWA_CAPTION_COLOR, &caption)?;
    paint(DWMWA_BORDER_COLOR, &border)
}
