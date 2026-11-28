'use strict';
const { Gtk, Gio, GdkPixbuf } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const GTK4 = Gtk.get_major_version() >= 4;   // GNOME 40+ settings windows use GTK 4
const put = (box, w) => GTK4 ? box.append(w) : box.add(w);

function init() {}

function buildPrefsWidget() {
    const s = ExtensionUtils.getSettings();
    const grid = new Gtk.Grid({ margin_top: 24, margin_bottom: 24, margin_start: 24, margin_end: 24, row_spacing: 14, column_spacing: 24, visible: true });
    let row = 0;

    const hb = new Gtk.Box({ spacing: 14, visible: true });
    let img;
    if (GTK4) { img = Gtk.Image.new_from_file(`${Me.path}/art/happy.png`); img.set_pixel_size(64); }
    else img = new Gtk.Image({ pixbuf: GdkPixbuf.Pixbuf.new_from_file_at_scale(`${Me.path}/art/happy.png`, 64, 64, true), visible: true });
    put(hb, img);
    const t = new Gtk.Label({ use_markup: true, xalign: 0, visible: true,
        label: '<b><big>GmCat Monitor</big></b>\nProcessor, memory and swap at a glance.' });
    put(hb, t);
    grid.attach(hb, 0, row++, 2, 1);

    function label(text) {
        return new Gtk.Label({ label: text, xalign: 0, hexpand: true, visible: true });
    }
    function addSwitch(text, key) {
        const w = new Gtk.Switch({ halign: Gtk.Align.END, visible: true });
        s.bind(key, w, 'active', Gio.SettingsBindFlags.DEFAULT);
        grid.attach(label(text), 0, row, 1, 1); grid.attach(w, 1, row++, 1, 1);
    }
    function addCombo(text, key, items) {
        const w = new Gtk.ComboBoxText({ halign: Gtk.Align.END, visible: true });
        for (const [id, name] of items) w.append(id, name);
        s.bind(key, w, 'active-id', Gio.SettingsBindFlags.DEFAULT);
        grid.attach(label(text), 0, row, 1, 1); grid.attach(w, 1, row++, 1, 1);
    }

    addCombo('Look', 'theme', [['gmcat', 'GmCat (mood cat)'], ['plain', 'Plain']]);
    addSwitch('Show in the top bar', 'show-panel');
    addSwitch('Numbers in the top bar', 'panel-numbers');
    addSwitch('Show on the desktop', 'show-desktop');
    addCombo('Desktop side', 'desktop-side', [['right', 'Right'], ['left', 'Left']]);

    const adj = new Gtk.Adjustment({ lower: 0.7, upper: 1.6, step_increment: 0.05 });
    s.bind('desktop-scale', adj, 'value', Gio.SettingsBindFlags.DEFAULT);
    const sc = new Gtk.Scale({ adjustment: adj, digits: 2, width_request: 200, halign: Gtk.Align.END, visible: true });
    grid.attach(label('Desktop panel size'), 0, row, 1, 1); grid.attach(sc, 1, row++, 1, 1);

    const sadj = new Gtk.Adjustment({ lower: 1, upper: 10, step_increment: 1 });
    s.bind('refresh-seconds', sadj, 'value', Gio.SettingsBindFlags.DEFAULT);
    const sp = new Gtk.SpinButton({ adjustment: sadj, halign: Gtk.Align.END, visible: true });
    grid.attach(label('Update every (seconds)'), 0, row, 1, 1); grid.attach(sp, 1, row++, 1, 1);

    return grid;
}
