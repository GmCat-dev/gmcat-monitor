//! The cat's mood, from the numbers. Same rules as the GNOME extension.
//! A new mood must hold for 2 updates before the cat changes (no flicker).

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mood { Sleepy, Happy, Busy, Stressed, Overload, Swapping }

impl Mood {
    pub fn key(self) -> &'static str {
        match self {
            Mood::Sleepy => "sleepy", Mood::Happy => "happy", Mood::Busy => "busy",
            Mood::Stressed => "stressed", Mood::Overload => "overload", Mood::Swapping => "swapping",
        }
    }
    /// (GmCat line, plain status word)
    pub fn words(self) -> (&'static str, &'static str) {
        match self {
            Mood::Sleepy => ("Napping. All quiet.", "Idle"),
            Mood::Happy => ("Purring along.", "Normal"),
            Mood::Busy => ("Working hard.", "Busy"),
            Mood::Stressed => ("Getting sweaty…", "Heavy"),
            Mood::Overload => ("On fire! Too much going on.", "Overloaded"),
            Mood::Swapping => ("Swap is making me queasy.", "Swapping a lot"),
        }
    }
}

pub struct Inputs { pub cpu_avg: f64, pub mem: f64, pub swap: f64, pub swap_rate_avg: Option<f64> }

pub struct MoodKeeper { pub mood: Mood, cand: Option<Mood>, count: u32, quiet_secs: f64 }

impl Default for MoodKeeper {
    fn default() -> Self { MoodKeeper { mood: Mood::Happy, cand: None, count: 0, quiet_secs: 0.0 } }
}

pub fn wanted(i: &Inputs, quiet_secs: f64) -> Mood {
    let (c, m) = (i.cpu_avg, i.mem);
    let swap_busy = i.swap_rate_avg.map(|r| r > 1.0).unwrap_or(false);
    if swap_busy || (i.swap >= 80.0 && m >= 88.0) { Mood::Swapping }
    else if c >= 90.0 || m >= 96.0 { Mood::Overload }
    else if c >= 65.0 || m >= 90.0 { Mood::Stressed }
    else if c >= 30.0 || m >= 82.0 { Mood::Busy }
    else if quiet_secs >= 30.0 { Mood::Sleepy }
    else { Mood::Happy }
}

impl MoodKeeper {
    /// `dt`: seconds since the last update.
    pub fn judge(&mut self, i: &Inputs, dt: f64) -> Mood {
        if i.cpu_avg < 6.0 && i.mem < 75.0 { self.quiet_secs += dt } else { self.quiet_secs = 0.0 }
        let want = wanted(i, self.quiet_secs);
        if want == self.mood { self.cand = None; return self.mood; }
        if Some(want) == self.cand { self.count += 1 } else { self.cand = Some(want); self.count = 1 }
        if self.count >= 2 { self.mood = want; self.cand = None; }
        self.mood
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn inp(c: f64, m: f64, s: f64, r: Option<f64>) -> Inputs { Inputs { cpu_avg: c, mem: m, swap: s, swap_rate_avg: r } }

    #[test]
    fn levels() {
        assert_eq!(wanted(&inp(10.0, 60.0, 0.0, None), 0.0), Mood::Happy);
        assert_eq!(wanted(&inp(35.0, 60.0, 0.0, None), 0.0), Mood::Busy);
        assert_eq!(wanted(&inp(10.0, 83.0, 0.0, None), 0.0), Mood::Busy);
        assert_eq!(wanted(&inp(70.0, 60.0, 0.0, None), 0.0), Mood::Stressed);
        assert_eq!(wanted(&inp(95.0, 60.0, 0.0, None), 0.0), Mood::Overload);
        assert_eq!(wanted(&inp(2.0, 50.0, 0.0, None), 31.0), Mood::Sleepy);
    }
    #[test]
    fn idle_full_swap_is_fine() {
        // swap 75% full but nothing moving and memory fine: not queasy (a real machine, 2026-11-22)
        assert_eq!(wanted(&inp(10.0, 62.0, 75.0, Some(0.1)), 0.0), Mood::Happy);
        assert_eq!(wanted(&inp(10.0, 62.0, 75.0, Some(2.0)), 0.0), Mood::Swapping);
        assert_eq!(wanted(&inp(10.0, 90.0, 85.0, None), 0.0), Mood::Swapping);
    }
    #[test]
    fn needs_two_updates() {
        let mut k = MoodKeeper::default();
        assert_eq!(k.judge(&inp(95.0, 50.0, 0.0, None), 2.0), Mood::Happy);
        assert_eq!(k.judge(&inp(95.0, 50.0, 0.0, None), 2.0), Mood::Overload);
        assert_eq!(k.judge(&inp(10.0, 50.0, 0.0, None), 2.0), Mood::Overload);
        assert_eq!(k.judge(&inp(10.0, 50.0, 0.0, None), 2.0), Mood::Happy);
    }
    #[test]
    fn falls_asleep_after_30s_quiet() {
        let mut k = MoodKeeper::default();
        let mut m = Mood::Happy;
        for _ in 0..20 { m = k.judge(&inp(2.0, 50.0, 0.0, None), 2.0); }
        assert_eq!(m, Mood::Sleepy);
    }
}
