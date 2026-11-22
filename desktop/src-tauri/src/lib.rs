//! GmCat Monitor for Windows, Mac and Linux.
//! Tray / menu-bar cat + numbers, a desktop panel behind your windows, and a Settings window.
//! Collects nothing and never goes online: it only reads this computer's own numbers.

mod mood;
mod settings;
mod stats;
#[cfg(windows)]
mod pin;

use mood::{Inputs, Mood, MoodKeeper};
use serde::Serialize;
use settings::Settings;
use stats::{Snapshot, Stats};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{TrayIcon, TrayIconBuilder};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, RunEvent, WebviewUrl, WebviewWindowBuilder, Wry};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

/// Handles to the tray and its menu lines (cheap to clone; never call them while holding the Shared lock).
#[derive(Clone)]
struct Ui {
    tray: TrayIcon,
    status: MenuItem<Wry>,
    cpu: MenuItem<Wry>,
    mem: MenuItem<Wry>,
    swap: MenuItem<Wry>,
    apps: Vec<MenuItem<Wry>>,
    look: CheckMenuItem<Wry>,
    desk: CheckMenuItem<Wry>,
}

struct Shared {
    settings: Settings,
    path: PathBuf,
    last: Snapshot,
    mood: Mood,
}

type St = Arc<Mutex<Shared>>;
struct UiState(Mutex<Option<Ui>>);

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Payload {
    #[serde(flatten)]
    snap: Snapshot,
    mood: &'static str,
    line: &'static str,
    word: &'static str,
    settings: Settings,
}

fn payload(s: &Shared) -> Payload {
    let (line, word) = s.mood.words();
    Payload { snap: s.last.clone(), mood: s.mood.key(), line, word, settings: s.settings.clone() }
}

fn gb(b: u64) -> String { format!("{:.1}", b as f64 / 1073741824.0) }

fn size_text(b: u64) -> String {
    if b >= 1073741824 { format!("{} GB", gb(b)) } else { format!("{} MB", b / 1048576) }
}

fn mood_icon(m: Mood) -> Image<'static> {
    let bytes: &[u8] = match m {
        Mood::Sleepy => include_bytes!("../tray/sleepy-64.png"),
        Mood::Happy => include_bytes!("../tray/happy-64.png"),
        Mood::Busy => include_bytes!("../tray/busy-64.png"),
        Mood::Stressed => include_bytes!("../tray/stressed-64.png"),
        Mood::Overload => include_bytes!("../tray/overload-64.png"),
        Mood::Swapping => include_bytes!("../tray/swapping-64.png"),
    };
    Image::from_bytes(bytes).expect("tray art")
}

fn level_rgb(p: f64) -> [u8; 3] {
    if p < 60.0 { [95, 209, 104] } else if p < 80.0 { [242, 193, 78] } else if p < 92.0 { [240, 138, 75] } else { [239, 91, 91] }
}

/// Plain look: three little bars (processor, memory, swap) drawn into a 32x32 icon.
fn bars_icon(s: &Snapshot) -> Image<'static> {
    let (w, h) = (32usize, 32usize);
    let mut px = vec![0u8; w * h * 4];
    for (i, v) in [s.cpu, s.mem, s.swap].iter().enumerate() {
        let x0 = 2 + i * 10;
        let fill = ((h - 4) as f64 * v / 100.0).round().max(1.0) as usize;
        let c = level_rgb(*v);
        for y in 2..h - 2 {
            for x in x0..x0 + 8 {
                let o = (y * w + x) * 4;
                let filled = y >= h - 2 - fill;
                let rgba = if filled { [c[0], c[1], c[2], 255] } else { [200, 200, 210, 70] };
                px[o..o + 4].copy_from_slice(&rgba);
            }
        }
    }
    Image::new_owned(px, w as u32, h as u32)
}

fn numbers(s: &Snapshot) -> String {
    format!("CPU {:.0}%  Mem {:.0}%  Swap {:.0}%", s.cpu, s.mem, s.swap)
}

// ------------------------------------------------------------------ panel window
fn place_panel(app: &AppHandle, set: &Settings) {
    let Some(w) = app.get_webview_window("panel") else { return };
    let mon = w.primary_monitor().ok().flatten().or_else(|| w.current_monitor().ok().flatten());
    let Some(mon) = mon else { return };
    let sf = mon.scale_factor();
    let wa = mon.work_area();
    let k = set.scale;
    let width = (300.0 * k * sf).round() as u32;
    let height = ((720.0 * k * sf).round() as u32).min(wa.size.height);
    let margin = (24.0 * k * sf).round() as i32;
    let x = if set.side == "left" { wa.position.x + margin } else { wa.position.x + wa.size.width as i32 - width as i32 - margin };
    let y = wa.position.y + (wa.size.height as i32 - height as i32) / 2;
    let _ = w.set_size(PhysicalSize::new(width, height));
    let _ = w.set_position(PhysicalPosition::new(x, y));
}

fn ensure_panel(app: &AppHandle, set: &Settings) {
    let existing = app.get_webview_window("panel");
    if !set.show_desktop {
        if let Some(w) = existing { let _ = w.destroy(); }
        return;
    }
    if existing.is_none() {
        let built = WebviewWindowBuilder::new(app, "panel", WebviewUrl::App("panel.html".into()))
            .title("GmCat Monitor panel")
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .skip_taskbar(true)
            .always_on_bottom(true)
            .resizable(false)
            .focused(false)
            .visible(false)
            .build();
        let Ok(w) = built else { return };
        let _ = w.set_ignore_cursor_events(true);
        #[cfg(windows)]
        if set.pin_to_wallpaper {
            if let Ok(h) = w.hwnd() { pin::pin_to_wallpaper(h.0 as isize); }
        }
    }
    place_panel(app, set);
    if let Some(w) = app.get_webview_window("panel") { let _ = w.show(); }
}

fn open_settings(app: &AppHandle, welcome: bool) {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    let url = if welcome { "settings.html?welcome=1" } else { "settings.html" };
    let _ = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App(url.into()))
        .title("GmCat Monitor")
        .inner_size(480.0, 640.0)
        .min_inner_size(400.0, 480.0)
        .resizable(true)
        .center()
        .build();
}

// ------------------------------------------------------------------ settings
fn apply_settings(app: &AppHandle, new: Settings) {
    let st = app.state::<St>();
    let (old, snap, mood) = {
        let mut s = st.lock().unwrap();
        let old = s.settings.clone();
        s.settings = new.clone().clean();
        s.settings.save(&s.path);
        (old, s.last.clone(), s.mood)
    };
    let new = new.clean();
    if let Some(ui) = app.state::<UiState>().0.lock().unwrap().clone() {
        let _ = ui.look.set_checked(new.theme == "gmcat");
        let _ = ui.desk.set_checked(new.show_desktop);
        let _ = ui.tray.set_icon(Some(if new.theme == "gmcat" { mood_icon(mood) } else { bars_icon(&snap) }));
        #[cfg(target_os = "macos")]
        let _ = ui.tray.set_title(if new.tray_numbers { Some(numbers(&snap)) } else { None });
    }
    if old.pin_to_wallpaper != new.pin_to_wallpaper {
        if let Some(w) = app.get_webview_window("panel") { let _ = w.destroy(); }
    }
    ensure_panel(app, &new);
    let p = { payload(&st.lock().unwrap()) };
    let _ = app.emit("stats", &p);
}

#[tauri::command]
fn get_state(app: AppHandle) -> serde_json::Value {
    let p = { payload(&app.state::<St>().lock().unwrap()) };
    let autostart = app.autolaunch().is_enabled().unwrap_or(false);
    serde_json::json!({ "payload": p, "autostart": autostart, "os": std::env::consts::OS, "version": env!("CARGO_PKG_VERSION") })
}

#[tauri::command]
async fn save_settings(app: AppHandle, settings: Settings) {
    apply_settings(&app, settings);
}

#[tauri::command]
async fn set_autostart(app: AppHandle, on: bool) -> bool {
    let a = app.autolaunch();
    let _ = if on { a.enable() } else { a.disable() };
    a.is_enabled().unwrap_or(false)
}

// ------------------------------------------------------------------ tray
fn build_tray(app: &AppHandle, set: &Settings) -> tauri::Result<Ui> {
    let status = MenuItem::with_id(app, "status", "Starting…", false, None::<&str>)?;
    let cpu = MenuItem::with_id(app, "cpu", "Processor: …", false, None::<&str>)?;
    let mem = MenuItem::with_id(app, "mem", "Memory: …", false, None::<&str>)?;
    let swap = MenuItem::with_id(app, "swap", "Swap: …", false, None::<&str>)?;
    let mut apps = Vec::new();
    for i in 0..5 { apps.push(MenuItem::with_id(app, format!("app{i}"), "…", false, None::<&str>)?); }
    let app_refs: Vec<&dyn tauri::menu::IsMenuItem<Wry>> = apps.iter().map(|a| a as &dyn tauri::menu::IsMenuItem<Wry>).collect();
    let apps_sub = Submenu::with_items(app, "Using the most memory", true, &app_refs)?;
    let look = CheckMenuItem::with_id(app, "look", "GmCat look (mood cat)", true, set.theme == "gmcat", None::<&str>)?;
    let desk = CheckMenuItem::with_id(app, "desk", "Show on the desktop", true, set.show_desktop, None::<&str>)?;
    let settings_i = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit GmCat Monitor", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[
        &status, &PredefinedMenuItem::separator(app)?,
        &cpu, &mem, &swap, &PredefinedMenuItem::separator(app)?,
        &apps_sub, &PredefinedMenuItem::separator(app)?,
        &look, &desk, &settings_i, &PredefinedMenuItem::separator(app)?, &quit,
    ])?;
    let tray = TrayIconBuilder::with_id("main")
        .icon(mood_icon(Mood::Happy))
        .tooltip("GmCat Monitor")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, ev| on_menu(app, ev.id().as_ref()))
        .build(app)?;
    Ok(Ui { tray, status, cpu, mem, swap, apps, look, desk })
}

fn on_menu(app: &AppHandle, id: &str) {
    let cur = { app.state::<St>().lock().unwrap().settings.clone() };
    match id {
        "look" => apply_settings(app, Settings { theme: if cur.theme == "gmcat" { "plain".into() } else { "gmcat".into() }, ..cur }),
        "desk" => apply_settings(app, Settings { show_desktop: !cur.show_desktop, ..cur }),
        "settings" => open_settings(app, false),
        "quit" => app.exit(0),
        _ => {}
    }
}

fn refresh_tray(ui: &Ui, p: &Payload, icon_key: &mut String) {
    let s = &p.snap;
    let themed = p.settings.theme == "gmcat";
    let key = if themed { p.mood.to_string() } else { format!("bars{:.0}-{:.0}-{:.0}", s.cpu / 5.0, s.mem / 5.0, s.swap / 5.0) };
    if *icon_key != key {
        let mood = match p.mood { "sleepy" => Mood::Sleepy, "busy" => Mood::Busy, "stressed" => Mood::Stressed,
                                  "overload" => Mood::Overload, "swapping" => Mood::Swapping, _ => Mood::Happy };
        let _ = ui.tray.set_icon(Some(if themed { mood_icon(mood) } else { bars_icon(s) }));
        *icon_key = key;
    }
    let head = if themed { p.line.to_string() } else { format!("Status: {}", p.word) };
    let _ = ui.tray.set_tooltip(Some(format!("GmCat Monitor · {}\n{}", head, numbers(s))));
    #[cfg(target_os = "macos")]
    let _ = ui.tray.set_title(if p.settings.tray_numbers { Some(numbers(s)) } else { None });
    let _ = ui.status.set_text(head);
    let load = s.load.map(|l| format!(" · load {l:.2}")).unwrap_or_default();
    let _ = ui.cpu.set_text(format!("Processor: {:.0}%  ({} cores{})", s.cpu, s.cores, load));
    let _ = ui.mem.set_text(format!("Memory: {} of {} GB · {:.0}%", gb(s.mem_used), gb(s.mem_total), s.mem));
    let swap = if s.swap_total == 0 { "Swap: none set up".to_string() } else {
        let moving = s.swap_rate.filter(|r| *r > 0.05).map(|r| format!(" · moving {r:.1} MB/s")).unwrap_or_default();
        format!("Swap: {} of {} GB · {:.0}%{}", gb(s.swap_used), gb(s.swap_total), s.swap, moving)
    };
    let _ = ui.swap.set_text(swap);
    for (i, it) in ui.apps.iter().enumerate() {
        let t = s.top.get(i).map(|(n, b)| format!("{n}   {}", size_text(*b))).unwrap_or_default();
        let _ = it.set_text(if t.is_empty() { "–".to_string() } else { t });
    }
}

// ------------------------------------------------------------------ the loop
fn start_ticker(app: AppHandle) {
    std::thread::spawn(move || {
        let mut stats = Stats::new();
        let mut keeper = MoodKeeper::default();
        let mut icon_key = String::new();
        let mut last = Instant::now();
        std::thread::sleep(Duration::from_millis(400));
        loop {
            let snap = stats.update();
            let dt = last.elapsed().as_secs_f64();
            last = Instant::now();
            let mood = keeper.judge(&Inputs { cpu_avg: snap.cpu_avg, mem: snap.mem, swap: snap.swap, swap_rate_avg: snap.swap_rate_avg }, dt);
            let (p, secs) = {
                let st = app.state::<St>();
                let mut s = st.lock().unwrap();
                s.last = snap;
                s.mood = mood;
                (payload(&s), s.settings.refresh_seconds)
            };
            let _ = app.emit("stats", &p);
            let ui = app.state::<UiState>().0.lock().unwrap().clone();
            if let Some(ui) = ui { refresh_tray(&ui, &p, &mut icon_key); }
            std::thread::sleep(Duration::from_secs(secs));
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| open_settings(app, false)))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--autostart"])))
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_state, save_settings, set_autostart])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            let path = app.path().app_config_dir().unwrap_or_else(|_| PathBuf::from(".")).join("settings.json");
            let mut set = Settings::load(&path);
            let first = !set.welcomed;
            if first {
                set.welcomed = true;
                set.save(&path);
                let _ = app.autolaunch().enable(); // start at sign-in by default; the welcome screen says so and has a switch
            }
            app.manage::<St>(Arc::new(Mutex::new(Shared { settings: set.clone(), path, last: Snapshot::default(), mood: Mood::Happy })));
            let ui = build_tray(app.handle(), &set)?;
            app.manage(UiState(Mutex::new(Some(ui))));
            ensure_panel(app.handle(), &set);
            if first { open_settings(app.handle(), true); }
            start_ticker(app.handle().clone());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("GmCat Monitor failed to start");
    app.run(|_app, ev| {
        // keep running in the tray when the Settings window closes
        if let RunEvent::ExitRequested { api, code, .. } = ev {
            if code.is_none() { api.prevent_exit(); }
        }
    });
}
