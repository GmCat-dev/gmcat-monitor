'use strict';
/* GmCat Monitor: CPU, memory and swap in the top bar and on the desktop.
 * GmCat look: a mood cat that follows how busy the computer is. Plain look: no cat.
 * Reads /proc only (no extra programs). GNOME Shell 3.36. */

const { GObject, St, Clutter, Gio, GLib } = imports.gi;
const ByteArray = imports.byteArray;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Util = imports.misc.util;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const HISTORY = 90;           // samples kept for the desktop graphs
const MOOD_LINES = {
    sleepy:   ['Napping. All quiet.',            'Idle'],
    happy:    ['Purring along.',                 'Normal'],
    busy:     ['Working hard.',                  'Busy'],
    stressed: ['Getting sweaty…',                'Heavy'],
    overload: ['On fire! Too much going on.',    'Overloaded'],
    swapping: ['Swap is making me queasy.',      'Swapping a lot'],
};
const MOOD_ACCENT = {
    sleepy: '#8f93b8', happy: '#b8bde8', busy: '#7fb6ff',
    stressed: '#f2c14e', overload: '#ef5b5b', swapping: '#8fdc5a',
};

function readText(path) {
    const [ok, bytes] = GLib.file_get_contents(path);
    return ok ? ByteArray.toString(bytes) : '';
}

function levelColor(pct) {
    if (pct < 60) return [0.37, 0.82, 0.41];
    if (pct < 80) return [0.95, 0.76, 0.31];
    if (pct < 92) return [0.94, 0.54, 0.29];
    return [0.94, 0.36, 0.36];
}

function gb(bytes) { return (bytes / 1073741824).toFixed(1); }

/* ---------- reading the numbers ---------- */
class Stats {
    constructor() {
        this._prevCpu = null;
        this._prevSwap = null;
        this.cpu = 0; this.cpuAvg = 0; this.mem = 0; this.swap = 0;
        this.memUsed = 0; this.memTotal = 0; this.swapUsed = 0; this.swapTotal = 0;
        this.swapRate = 0; this.load = [0, 0, 0];
        this.cores = GLib.get_num_processors();
        this.hist = { cpu: [], mem: [], swap: [] };
    }

    update() {
        const now = GLib.get_monotonic_time() / 1e6;
        const f = readText('/proc/stat').split('\n')[0].trim().split(/\s+/).slice(1, 9).map(Number);
        const idle = f[3] + (f[4] || 0);
        const total = f.reduce((a, b) => a + b, 0);
        if (this._prevCpu) {
            const dt = total - this._prevCpu.total, di = idle - this._prevCpu.idle;
            this.cpu = dt > 0 ? Math.max(0, Math.min(100, 100 * (dt - di) / dt)) : 0;
        }
        this._prevCpu = { total, idle };

        const mi = {};
        for (const l of readText('/proc/meminfo').split('\n')) {
            const m = l.match(/^(\w+):\s+(\d+)/);
            if (m) mi[m[1]] = Number(m[2]) * 1024;
        }
        this.memTotal = mi.MemTotal;
        this.memUsed = mi.MemTotal - mi.MemAvailable;
        this.mem = 100 * this.memUsed / this.memTotal;
        this.swapTotal = mi.SwapTotal || 0;
        this.swapUsed = this.swapTotal - (mi.SwapFree || 0);
        this.swap = this.swapTotal ? 100 * this.swapUsed / this.swapTotal : 0;

        // swap traffic (pages moved in + out per second) -> MB/s
        const vm = readText('/proc/vmstat');
        const pin = Number((vm.match(/^pswpin (\d+)/m) || [0, 0])[1]);
        const pout = Number((vm.match(/^pswpout (\d+)/m) || [0, 0])[1]);
        if (this._prevSwap) {
            const sec = Math.max(0.5, now - this._prevSwap.t);
            this.swapRate = ((pin + pout) - this._prevSwap.pages) * 4096 / 1048576 / sec;
        }
        this._prevSwap = { pages: pin + pout, t: now };
        this._swapRates = (this._swapRates || []).concat([this.swapRate]).slice(-3);
        this.swapRateAvg = this._swapRates.reduce((a, b) => a + b, 0) / this._swapRates.length;

        this.load = readText('/proc/loadavg').split(' ').slice(0, 3).map(Number);

        for (const [k, v] of [['cpu', this.cpu], ['mem', this.mem], ['swap', this.swap]]) {
            const h = this.hist[k];
            h.push(v);
            if (h.length > HISTORY) h.shift();
        }
        const last = this.hist.cpu.slice(-3);
        this.cpuAvg = last.reduce((a, b) => a + b, 0) / last.length;
    }
}

/* The cat changes mood only after the new mood holds for 2 updates (no flicker). */
class MoodKeeper {
    constructor() { this.mood = 'happy'; this._cand = null; this._count = 0; this._quietSince = null; }

    judge(s) {
        const c = s.cpuAvg, m = s.mem;
        const now = GLib.get_monotonic_time() / 1e6;
        if (c < 6 && m < 75) { if (this._quietSince === null) this._quietSince = now; }
        else this._quietSince = null;
        let want;
        // queasy only when swap is really busy (data moving), or memory AND swap are both nearly full
        if (s.swapRateAvg > 1.0 || (s.swap >= 80 && m >= 88)) want = 'swapping';
        else if (c >= 90 || m >= 96) want = 'overload';
        else if (c >= 65 || m >= 90) want = 'stressed';
        else if (c >= 30 || m >= 82) want = 'busy';
        else if (this._quietSince !== null && now - this._quietSince >= 30) want = 'sleepy';
        else want = 'happy';
        if (want === this.mood) { this._cand = null; return this.mood; }
        if (want === this._cand) this._count++;
        else { this._cand = want; this._count = 1; }
        if (this._count >= 2) { this.mood = want; this._cand = null; }
        return this.mood;
    }
}

const _icons = {};
function moodIcon(mood) {
    if (!_icons[mood])
        _icons[mood] = Gio.FileIcon.new(Gio.File.new_for_path(`${Me.path}/art/${mood}.png`));
    return _icons[mood];
}

const _shown = new WeakMap();
function setMoodIcon(icon, mood) {
    if (_shown.get(icon) === mood) return;
    const first = !_shown.has(icon);
    _shown.set(icon, mood);
    if (first) { icon.gicon = moodIcon(mood); return; }
    icon.remove_all_transitions();
    icon.ease({
        opacity: 0, duration: 140, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        onComplete: () => {
            icon.gicon = moodIcon(mood);
            icon.ease({ opacity: 255, duration: 220, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
        },
    });
}

/* Apps using the most memory (grouped by program name). Read only when the menu opens. */
function topApps(n) {
    const sums = {};
    let en;
    try {
        en = Gio.File.new_for_path('/proc').enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
    } catch (e) { return []; }
    let info;
    while ((info = en.next_file(null)) !== null) {
        const pid = info.get_name();
        if (!/^\d+$/.test(pid)) continue;
        try {
            const st = readText(`/proc/${pid}/status`);
            const name = (st.match(/^Name:\s+(.+)$/m) || [])[1];
            const rss = (st.match(/^VmRSS:\s+(\d+)/m) || [])[1];
            if (name && rss) sums[name] = (sums[name] || 0) + Number(rss) * 1024;
        } catch (e) { /* process ended */ }
    }
    en.close(null);
    return Object.entries(sums).sort((a, b) => b[1] - a[1]).slice(0, n);
}

function prettyName(n) {
    const map = { 'brave': 'Brave', 'chrome': 'Chrome', 'gnome-shell': 'Desktop (GNOME)', 'Xorg': 'Display (Xorg)',
        'node': 'Node', 'node-MainThread': 'Node', 'claude.exe': 'Claude Code', 'python3': 'Python', 'firefox': 'Firefox', 'code': 'VS Code', 'claude': 'Claude Code' };
    return map[n] || n;
}

/* ---------- top bar ---------- */
const Indicator = GObject.registerClass(
class GmCatMonitorIndicator extends PanelMenu.Button {
    _init(ext) {
        super._init(0.0, 'GmCat Monitor');
        this._ext = ext;
        const themed = ext.settings.get_string('theme') === 'gmcat';
        const box = new St.BoxLayout({ style_class: 'gmm-panel-box' });
        if (themed) {
            this._cat = new St.Icon({ style_class: 'gmm-panel-cat', icon_size: 22, y_align: Clutter.ActorAlign.CENTER });
            box.add_child(this._cat);
        }
        this._bars = new St.DrawingArea({ style_class: 'gmm-panel-bars', width: 23, height: 16, y_align: Clutter.ActorAlign.CENTER });
        this._bars.connect('repaint', a => this._paintBars(a));
        box.add_child(this._bars);
        if (ext.settings.get_boolean('panel-numbers')) {
            this._label = new St.Label({ style_class: 'gmm-panel-label', y_align: Clutter.ActorAlign.CENTER, text: '…' });
            box.add_child(this._label);
        }
        this.add_child(box);
        this._buildMenu(themed);
    }

    _paintBars(area) {
        const cr = area.get_context();
        const [w, h] = area.get_surface_size();
        const s = this._ext.stats;
        const vals = [s.cpu, s.mem, s.swap];
        const bw = 5, gap = 3;
        vals.forEach((v, i) => {
            const x = i * (bw + gap);
            cr.setSourceRGBA(1, 1, 1, 0.18);
            cr.rectangle(x, 0, bw, h); cr.fill();
            const [r, g, b] = levelColor(v);
            cr.setSourceRGBA(r, g, b, 1);
            const bh = Math.max(1, Math.round(h * v / 100));
            cr.rectangle(x, h - bh, bw, bh); cr.fill();
        });
        cr.$dispose();
    }

    _buildMenu(themed) {
        const head = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
        const hb = new St.BoxLayout({ style_class: 'gmm-menu-head' });
        if (themed) {
            this._menuCat = new St.Icon({ icon_size: 56, style_class: 'gmm-menu-cat' });
            hb.add_child(this._menuCat);
        }
        const tb = new St.BoxLayout({ vertical: true, y_align: Clutter.ActorAlign.CENTER });
        this._moodLabel = new St.Label({ style_class: 'gmm-menu-mood' });
        this._moodSub = new St.Label({ style_class: 'gmm-menu-sub', opacity: 170 });
        tb.add_child(this._moodLabel); tb.add_child(this._moodSub);
        hb.add_child(tb);
        head.add_child(hb);
        this.menu.addMenuItem(head);

        this._rows = {};
        for (const [k, name] of [['cpu', 'Processor'], ['mem', 'Memory'], ['swap', 'Swap']]) {
            const it = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
            const n = new St.Label({ text: name, style_class: 'gmm-menu-name' });
            const v = new St.Label({ style_class: 'gmm-menu-value', x_expand: true, x_align: Clutter.ActorAlign.END });
            it.add_child(n); it.add_child(v);
            this.menu.addMenuItem(it);
            this._rows[k] = v;
        }

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem('Using the most memory'));
        this._apps = [];
        for (let i = 0; i < 5; i++) {
            const it = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
            const n = new St.Label({ style_class: 'gmm-menu-app' });
            const v = new St.Label({ style_class: 'gmm-menu-app-v', x_expand: true, x_align: Clutter.ActorAlign.END });
            it.add_child(n); it.add_child(v);
            this.menu.addMenuItem(it);
            this._apps.push([n, v]);
        }

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const st = this._ext.settings;
        const look = new PopupMenu.PopupSwitchMenuItem('GmCat look (mood cat)', st.get_string('theme') === 'gmcat');
        look.connect('toggled', (_i, on) => st.set_string('theme', on ? 'gmcat' : 'plain'));
        this.menu.addMenuItem(look);
        const desk = new PopupMenu.PopupSwitchMenuItem('Show on the desktop', st.get_boolean('show-desktop'));
        desk.connect('toggled', (_i, on) => st.set_boolean('show-desktop', on));
        this.menu.addMenuItem(desk);
        const prefs = new PopupMenu.PopupMenuItem('Settings…');
        prefs.connect('activate', () => Util.spawn(['gnome-extensions', 'prefs', Me.uuid]));
        this.menu.addMenuItem(prefs);

        this.menu.connect('open-state-changed', (_m, open) => { if (open) { this._fillApps(); this.refresh(); } });
    }

    _fillApps() {
        const list = topApps(5);
        this._apps.forEach(([n, v], i) => {
            const e = list[i];
            n.text = e ? prettyName(e[0]) : '';
            v.text = e ? (e[1] >= 1073741824 ? `${gb(e[1])} GB` : `${Math.round(e[1] / 1048576)} MB`) : '';
        });
    }

    refresh() {
        const s = this._ext.stats, mood = this._ext.mood.mood;
        if (this._cat) setMoodIcon(this._cat, mood);
        this._bars.queue_repaint();
        if (this._label)
            this._label.text = `CPU ${Math.round(s.cpu)}%  Mem ${Math.round(s.mem)}%  Swap ${Math.round(s.swap)}%`;
        if (this.menu.isOpen) {
            if (this._menuCat) setMoodIcon(this._menuCat, mood);
            const themed = !!this._menuCat;
            this._moodLabel.text = themed ? MOOD_LINES[mood][0] : `Status: ${MOOD_LINES[mood][1]}`;
            this._moodSub.text = `${s.cores} cores · load ${s.load.map(x => x.toFixed(2)).join(' ')}`;
            this._rows.cpu.text = `${Math.round(s.cpu)}%`;
            this._rows.mem.text = `${gb(s.memUsed)} of ${gb(s.memTotal)} GB · ${Math.round(s.mem)}%`;
            this._rows.swap.text = s.swapTotal
                ? `${gb(s.swapUsed)} of ${gb(s.swapTotal)} GB · ${Math.round(s.swap)}%` +
                  (s.swapRate > 0.05 ? ` · moving ${s.swapRate.toFixed(1)} MB/s` : '')
                : 'none set up';
        }
    }
});

/* ---------- desktop panel (sits on the wallpaper, under windows) ---------- */
const DesktopPanel = GObject.registerClass(
class GmCatMonitorDesktop extends St.BoxLayout {
    _init(ext) {
        const themed = ext.settings.get_string('theme') === 'gmcat';
        const k = ext.settings.get_double('desktop-scale');
        super._init({ vertical: true, reactive: false, style_class: `gmm-desk ${themed ? 'gmm-gmcat' : 'gmm-plain'}` });
        this._ext = ext; this._k = k; this._themed = themed;
        const px = v => Math.round(v * k);
        this.width = px(290);
        this.set_style(`padding: ${px(14)}px ${px(16)}px; spacing: ${px(10)}px;`);

        const head = new St.BoxLayout({ vertical: !themed ? false : true, style: `spacing: ${px(6)}px;` });
        if (themed) {
            this._cat = new St.Icon({ icon_size: px(128), x_align: Clutter.ActorAlign.CENTER, style_class: 'gmm-desk-cat' });
            head.add_child(this._cat);
        }
        this._line = new St.Label({ style_class: 'gmm-desk-line', x_align: themed ? Clutter.ActorAlign.CENTER : Clutter.ActorAlign.START,
            style: `font-size: ${px(themed ? 17 : 16)}px;` });
        head.add_child(this._line);
        this.add_child(head);

        this._cards = {};
        for (const [key, name] of [['cpu', 'Processor'], ['mem', 'Memory'], ['swap', 'Swap']]) {
            const card = new St.BoxLayout({ vertical: true, style_class: 'gmm-card', style: `padding: ${px(8)}px ${px(10)}px; spacing: ${px(3)}px;` });
            const top = new St.BoxLayout();
            const n = new St.Label({ text: name, style_class: 'gmm-card-name', style: `font-size: ${px(15)}px;`, y_align: Clutter.ActorAlign.END });
            const v = new St.Label({ style_class: 'gmm-card-value', style: `font-size: ${px(26)}px;`, x_expand: true, x_align: Clutter.ActorAlign.END });
            top.add_child(n); top.add_child(v);
            const sub = new St.Label({ style_class: 'gmm-card-sub', style: `font-size: ${px(13)}px;` });
            const graph = new St.DrawingArea({ height: px(44), x_expand: true });
            graph.connect('repaint', a => this._paintGraph(a, key));
            card.add_child(top); card.add_child(graph); card.add_child(sub);
            this.add_child(card);
            this._cards[key] = { v, sub, graph };
        }
    }

    _paintGraph(area, key) {
        const cr = area.get_context();
        const [w, h] = area.get_surface_size();
        const data = this._ext.stats.hist[key];
        // grid lines at 50% and 80%
        cr.setSourceRGBA(1, 1, 1, 0.08);
        cr.setLineWidth(1);
        for (const p of [0.5, 0.8]) { cr.moveTo(0, Math.round(h - h * p) + 0.5); cr.lineTo(w, Math.round(h - h * p) + 0.5); }
        cr.stroke();
        if (data.length > 1) {
            const step = w / (HISTORY - 1);
            const x0 = w - (data.length - 1) * step;
            const cur = data[data.length - 1];
            const [r, g, b] = levelColor(cur);
            if (this._themed) {
                // chunky pixel columns, GmCat style
                const bw = Math.max(2, Math.floor(step * 2));
                for (let i = data.length - 1, x = w - bw; i >= 0 && x > -bw; i -= 2, x -= bw + 1) {
                    const [cr2, cg2, cb2] = levelColor(data[i]);
                    const bh = Math.max(1, Math.round(h * data[i] / 100));
                    cr.setSourceRGBA(cr2, cg2, cb2, 0.85);
                    cr.rectangle(x, h - bh, bw, bh); cr.fill();
                }
            } else {
                cr.moveTo(x0, h);
                data.forEach((v, i) => cr.lineTo(x0 + i * step, h - h * v / 100));
                cr.lineTo(w, h); cr.closePath();
                cr.setSourceRGBA(r, g, b, 0.25); cr.fillPreserve();
                cr.newPath();
                data.forEach((v, i) => (i ? cr.lineTo : cr.moveTo).call(cr, x0 + i * step, h - h * v / 100));
                cr.setSourceRGBA(r, g, b, 0.95); cr.setLineWidth(1.6); cr.stroke();
            }
        }
        cr.$dispose();
    }

    refresh() {
        const s = this._ext.stats, mood = this._ext.mood.mood;
        if (this._cat) setMoodIcon(this._cat, mood);
        this._line.text = this._themed ? MOOD_LINES[mood][0] : `System · ${MOOD_LINES[mood][1]}`;
        if (this._themed) this.set_style(this.get_style().replace(/border-color:[^;]*;/, '') + `border-color: ${MOOD_ACCENT[mood]};`);
        const c = this._cards;
        c.cpu.v.text = `${Math.round(s.cpu)}%`;
        c.cpu.sub.text = `${s.cores} cores · load ${s.load[0].toFixed(2)}`;
        c.mem.v.text = `${Math.round(s.mem)}%`;
        c.mem.sub.text = `${gb(s.memUsed)} of ${gb(s.memTotal)} GB used`;
        c.swap.v.text = s.swapTotal ? `${Math.round(s.swap)}%` : '–';
        c.swap.sub.text = s.swapTotal
            ? `${gb(s.swapUsed)} of ${gb(s.swapTotal)} GB used` + (s.swapRate > 0.05 ? ` · ${s.swapRate.toFixed(1)} MB/s` : '')
            : 'No swap set up';
        for (const key in c) {
            const pct = key === 'cpu' ? s.cpu : key === 'mem' ? s.mem : s.swap;
            const [r, g, b] = levelColor(pct);
            c[key].v.set_style(c[key].v.get_style().replace(/color:[^;]*;/, '') +
                `color: rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)});`);
            c[key].graph.queue_repaint();
        }
    }
});

/* ---------- the extension ---------- */
class Extension {
    enable() {
        this.settings = ExtensionUtils.getSettings();
        this.stats = new Stats();
        this.mood = new MoodKeeper();
        this.stats.update();
        this._build();
        this._settingsId = this.settings.connect('changed', (_s, key) => {
            if (key === 'refresh-seconds') this._startTimer();
            else this._build();
        });
        this._monId = Main.layoutManager.connect('monitors-changed', () => this._place());
        this._waId = global.display.connect('workareas-changed', () => this._place());
        this._startTimer();
    }

    disable() {
        if (this._timer) { GLib.source_remove(this._timer); this._timer = 0; }
        if (this._settingsId) this.settings.disconnect(this._settingsId);
        if (this._monId) Main.layoutManager.disconnect(this._monId);
        if (this._waId) global.display.disconnect(this._waId);
        this._settingsId = this._monId = this._waId = 0;
        this._teardown();
        this.settings = null; this.stats = null; this.mood = null;
    }

    _startTimer() {
        if (this._timer) GLib.source_remove(this._timer);
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, this.settings.get_int('refresh-seconds'), () => {
            this._tick();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _tick() {
        try {
            this.stats.update();
            this.mood.judge(this.stats);
            if (this._indicator) this._indicator.refresh();
            if (this._desk) this._desk.refresh();
        } catch (e) {
            logError(e, 'GmCat Monitor');
        }
    }

    _teardown() {
        if (this._indicator) { this._indicator.destroy(); this._indicator = null; }
        if (this._desk) { this._desk.destroy(); this._desk = null; }
    }

    _build() {
        this._teardown();
        if (this.settings.get_boolean('show-panel')) {
            this._indicator = new Indicator(this);
            Main.panel.addToStatusArea('gmcat-monitor', this._indicator, 0, 'right');
            this._indicator.refresh();
        }
        if (this.settings.get_boolean('show-desktop')) {
            this._desk = new DesktopPanel(this);
            Main.layoutManager._backgroundGroup.add_child(this._desk);
            this._desk.connect('notify::height', () => this._place());
            this._desk.refresh();
            this._place();
        }
    }

    _place() {
        const d = this._desk;
        if (!d) return;
        const group = Main.layoutManager._backgroundGroup;
        group.set_child_above_sibling(d, null);          // keep above the wallpaper after it changes
        const mon = Main.layoutManager.primaryIndex;
        const wa = Main.layoutManager.getWorkAreaForMonitor(mon);
        const k = this.settings.get_double('desktop-scale');
        const margin = Math.round(28 * k);
        const [, natH] = d.get_preferred_height(d.width);
        const x = this.settings.get_string('desktop-side') === 'left'
            ? wa.x + margin : wa.x + wa.width - d.width - margin;
        const y = wa.y + Math.max(margin, Math.round((wa.height - natH) / 2));
        d.set_position(Math.round(x), Math.round(y));
    }
}

function init() {
    return new Extension();
}
