//! Settings, saved as settings.json in the app's config folder.
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub theme: String,          // "gmcat" | "plain"
    pub show_desktop: bool,
    pub side: String,           // "right" | "left"
    pub scale: f64,             // 0.7 .. 1.6
    pub refresh_seconds: u64,   // 1 .. 10
    pub tray_numbers: bool,     // Mac menu bar text / tooltip detail
    pub pin_to_wallpaper: bool, // Windows only, experimental
    pub welcomed: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings { theme: "gmcat".into(), show_desktop: true, side: "right".into(), scale: 1.0, refresh_seconds: 2,
                   tray_numbers: true, pin_to_wallpaper: false, welcomed: false }
    }
}

impl Settings {
    pub fn clean(mut self) -> Self {
        if self.theme != "plain" { self.theme = "gmcat".into(); }
        if self.side != "left" { self.side = "right".into(); }
        self.scale = self.scale.clamp(0.7, 1.6);
        self.refresh_seconds = self.refresh_seconds.clamp(1, 10);
        self
    }
    pub fn load(path: &PathBuf) -> Self {
        std::fs::read_to_string(path).ok().and_then(|t| serde_json::from_str::<Settings>(&t).ok()).unwrap_or_default().clean()
    }
    pub fn save(&self, path: &PathBuf) {
        if let Some(dir) = path.parent() { let _ = std::fs::create_dir_all(dir); }
        let _ = std::fs::write(path, serde_json::to_string_pretty(self).unwrap_or_default());
    }
}
