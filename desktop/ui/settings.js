// GmCat Monitor settings window. Every change saves straight away.
(function () {
  "use strict";
  var T = window.__TAURI__;
  var ids = ["theme", "showDesktop", "side", "scale", "refreshSeconds", "trayNumbers", "pinToWallpaper"];
  var cur = null, savedTimer = 0;
  function $(id) { return document.getElementById(id); }
  function say(t) { $("saved").textContent = t; clearTimeout(savedTimer); savedTimer = setTimeout(function () { $("saved").textContent = ""; }, 1500); }
  function controls(set) {
    cur = set;
    ids.forEach(function (k) { var el = $(k); if (el.type === "checkbox") el.checked = !!cur[k]; else el.value = String(cur[k]); });
    $("scaleV").textContent = Math.round(cur.scale * 100) + "%";
  }
  function fill(st) {
    controls(st.payload.settings);
    $("autostart").checked = !!st.autostart;
    document.querySelectorAll(".mac-only").forEach(function (e) { e.hidden = st.os !== "macos"; });
    document.querySelectorAll(".win-only").forEach(function (e) { e.hidden = st.os !== "windows"; });
    $("ver").textContent = "Version " + st.version;
    if (/welcome=1/.test(location.search)) {
      $("welcome").hidden = false;
      $("where").textContent = st.os === "windows"
        ? "Look for my face in the tray, bottom right. If you can't see me, click the little ^ arrow and drag me onto the taskbar so I stay in view."
        : st.os === "macos" ? "Look for my face in the menu bar, top right." : "Look for my face in your tray or top bar.";
    }
  }
  function save() {
    var next = Object.assign({}, cur);
    ids.forEach(function (k) {
      var el = $(k);
      next[k] = el.type === "checkbox" ? el.checked : (k === "scale" ? parseFloat(el.value) : k === "refreshSeconds" ? parseInt(el.value, 10) : el.value);
    });
    cur = next;
    $("scaleV").textContent = Math.round(cur.scale * 100) + "%";
    if (T) T.core.invoke("save_settings", { settings: next }).then(function () { say("Saved ✓"); });
  }
  ids.forEach(function (k) { $(k).addEventListener(k === "scale" ? "input" : "change", save); });
  $("autostart").addEventListener("change", function () {
    if (T) T.core.invoke("set_autostart", { on: $("autostart").checked }).then(function (on) { $("autostart").checked = on; say(on ? "I'll start when you sign in ✓" : "I won't start by myself ✓"); });
  });
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest("[data-url]"); if (!a) return; ev.preventDefault();
    if (T && T.opener) T.opener.openUrl(a.getAttribute("data-url"));
  });
  window.gmFill = fill; // used by the browser test page
  if (T) {
    T.core.invoke("get_state").then(fill);
    // keep in step when the tray menu changes a setting
    T.event.listen("stats", function (ev) { if (cur && JSON.stringify(ev.payload.settings) !== JSON.stringify(cur)) controls(ev.payload.settings); });
  }
})();
