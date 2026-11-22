//! Windows only, experimental: put the desktop panel INTO the wallpaper layer (behind the desktop icons),
//! the way wallpaper apps do, so "Show desktop" (Win+D) doesn't hide it. If anything isn't found, nothing changes
//! and the panel simply stays as a bottom-most window.
use std::ptr::null;
use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM, WPARAM};
use windows_sys::Win32::UI::WindowsAndMessaging::{EnumWindows, FindWindowExW, FindWindowW, SendMessageTimeoutW, SetParent, SMTO_NORMAL};

fn w(s: &str) -> Vec<u16> { s.encode_utf16().chain(std::iter::once(0)).collect() }

unsafe extern "system" fn find_worker(top: HWND, lp: LPARAM) -> BOOL {
    let defview = FindWindowExW(top, std::ptr::null_mut(), w("SHELLDLL_DefView").as_ptr(), null());
    if !defview.is_null() {
        // the WorkerW we want is the next top-level WorkerW after the one holding the desktop icons
        let worker = FindWindowExW(std::ptr::null_mut(), top, w("WorkerW").as_ptr(), null());
        if !worker.is_null() { *(lp as *mut HWND) = worker; }
    }
    1
}

pub fn pin_to_wallpaper(hwnd: isize) -> bool {
    unsafe {
        let progman = FindWindowW(w("Progman").as_ptr(), null());
        if progman.is_null() { return false; }
        let mut res: usize = 0;
        // ask Explorer to create the wallpaper WorkerW
        SendMessageTimeoutW(progman, 0x052C, 0xD as WPARAM, 0x1 as LPARAM, SMTO_NORMAL, 1000, &mut res);
        SendMessageTimeoutW(progman, 0x052C, 0 as WPARAM, 0 as LPARAM, SMTO_NORMAL, 1000, &mut res);
        let mut worker: HWND = std::ptr::null_mut();
        EnumWindows(Some(find_worker), &mut worker as *mut HWND as LPARAM);
        if worker.is_null() {
            // Windows 11 24H2 and later keep the WorkerW inside Progman
            worker = FindWindowExW(progman, std::ptr::null_mut(), w("WorkerW").as_ptr(), null());
        }
        if worker.is_null() { return false; }
        !SetParent(hwnd as HWND, worker).is_null()
    }
}
