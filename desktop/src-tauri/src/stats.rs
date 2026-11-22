//! Reads processor, memory and swap. Uses sysinfo on every system; on Linux also /proc/vmstat for swap traffic.
use serde::Serialize;
use std::collections::{HashMap, VecDeque};
use sysinfo::{MemoryRefreshKind, ProcessRefreshKind, ProcessesToUpdate, RefreshKind, System, CpuRefreshKind};

pub const HISTORY: usize = 90;

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub cpu: f64,
    pub cpu_avg: f64,
    pub mem: f64,
    pub mem_used: u64,
    pub mem_total: u64,
    pub swap: f64,
    pub swap_used: u64,
    pub swap_total: u64,
    pub swap_rate: Option<f64>,
    pub swap_rate_avg: Option<f64>,
    pub cores: usize,
    pub load: Option<f64>,
    pub hist_cpu: Vec<f64>,
    pub hist_mem: Vec<f64>,
    pub hist_swap: Vec<f64>,
    pub top: Vec<(String, u64)>,
}

pub struct Stats {
    sys: System,
    hist: [VecDeque<f64>; 3],
    swap_rates: VecDeque<f64>,
    prev_pages: Option<(u64, std::time::Instant)>,
    tick: u64,
    top: Vec<(String, u64)>,
}

impl Stats {
    pub fn new() -> Self {
        let sys = System::new_with_specifics(
            RefreshKind::nothing().with_cpu(CpuRefreshKind::nothing().with_cpu_usage()).with_memory(MemoryRefreshKind::everything()));
        Stats { sys, hist: Default::default(), swap_rates: VecDeque::new(), prev_pages: None, tick: 0, top: vec![] }
    }

    pub fn update(&mut self) -> Snapshot {
        self.sys.refresh_cpu_usage();
        self.sys.refresh_memory();
        let cpu = self.sys.global_cpu_usage().clamp(0.0, 100.0) as f64;
        let mem_total = self.sys.total_memory();
        let mem_used = mem_total.saturating_sub(self.sys.available_memory());
        let swap_total = self.sys.total_swap();
        let swap_used = self.sys.used_swap();
        let mem = if mem_total > 0 { 100.0 * mem_used as f64 / mem_total as f64 } else { 0.0 };
        let swap = if swap_total > 0 { 100.0 * swap_used as f64 / swap_total as f64 } else { 0.0 };

        let swap_rate = self.swap_rate();
        if let Some(r) = swap_rate {
            self.swap_rates.push_back(r);
            if self.swap_rates.len() > 3 { self.swap_rates.pop_front(); }
        }
        let swap_rate_avg = if self.swap_rates.is_empty() { None }
            else { Some(self.swap_rates.iter().sum::<f64>() / self.swap_rates.len() as f64) };

        for (h, v) in self.hist.iter_mut().zip([cpu, mem, swap]) {
            h.push_back(v);
            if h.len() > HISTORY { h.pop_front(); }
        }
        let last: Vec<f64> = self.hist[0].iter().rev().take(3).copied().collect();
        let cpu_avg = last.iter().sum::<f64>() / last.len().max(1) as f64;

        // the list of hungry programs is heavier to read, so only every 5th update
        if self.tick % 5 == 0 { self.top = self.read_top(5); }
        self.tick += 1;

        let load = { let l = System::load_average().one; if l > 0.0 { Some(l) } else { None } };
        Snapshot {
            cpu, cpu_avg, mem, mem_used, mem_total, swap, swap_used, swap_total, swap_rate, swap_rate_avg,
            cores: self.sys.cpus().len(), load,
            hist_cpu: self.hist[0].iter().copied().collect(),
            hist_mem: self.hist[1].iter().copied().collect(),
            hist_swap: self.hist[2].iter().copied().collect(),
            top: self.top.clone(),
        }
    }

    fn read_top(&mut self, n: usize) -> Vec<(String, u64)> {
        self.sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing().with_memory());
        let mut sums: HashMap<String, u64> = HashMap::new();
        for p in self.sys.processes().values() {
            let mut name = p.name().to_string_lossy().to_string();
            if let Some(s) = name.strip_suffix(".exe") { name = s.to_string(); }
            *sums.entry(name).or_default() += p.memory();
        }
        let mut v: Vec<_> = sums.into_iter().collect();
        v.sort_by(|a, b| b.1.cmp(&a.1));
        v.truncate(n);
        v
    }

    /// MB per second moved in and out of swap. Linux only (other systems: None).
    fn swap_rate(&mut self) -> Option<f64> {
        #[cfg(target_os = "linux")]
        {
            let vm = std::fs::read_to_string("/proc/vmstat").ok()?;
            let get = |k: &str| vm.lines().find_map(|l| l.strip_prefix(k)?.trim().parse::<u64>().ok()).unwrap_or(0);
            let pages = get("pswpin ") + get("pswpout ");
            let now = std::time::Instant::now();
            let out = self.prev_pages.map(|(p, t)| {
                let sec = now.duration_since(t).as_secs_f64().max(0.5);
                pages.saturating_sub(p) as f64 * 4096.0 / 1048576.0 / sec
            });
            self.prev_pages = Some((pages, now));
            out
        }
        #[cfg(not(target_os = "linux"))]
        { let _ = &self.prev_pages; None }
    }
}
