// GmCat Monitor desktop panel: draws what the app sends every update.
(function () {
  "use strict";
  var ACCENT = { sleepy: "#8f93b8", happy: "#b8bde8", busy: "#7fb6ff", stressed: "#f2c14e", overload: "#ef5b5b", swapping: "#8fdc5a" };
  var HISTORY = 90;
  var panel = document.getElementById("panel"), cat = document.getElementById("cat"), line = document.getElementById("line");
  var shownMood = "happy";
  function level(p) { return p < 60 ? [95, 209, 104] : p < 80 ? [242, 193, 78] : p < 92 ? [240, 138, 75] : [239, 91, 91]; }
  function rgb(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + (a == null ? 1 : a) + ")"; }
  function gb(b) { return (b / 1073741824).toFixed(1); }

  function graph(cv, data, themed) {
    var dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    var g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    g.strokeStyle = "rgba(255,255,255,.08)"; g.lineWidth = 1; g.beginPath();
    [0.5, 0.8].forEach(function (p) { var y = Math.round(h - h * p) + 0.5; g.moveTo(0, y); g.lineTo(w, y); }); g.stroke();
    if (!data || data.length < 2) return;
    var step = w / (HISTORY - 1);
    if (themed) {
      var bw = Math.max(2, Math.floor(step * 2));
      for (var i = data.length - 1, x = w - bw; i >= 0 && x > -bw; i -= 2, x -= bw + 1) {
        var bh = Math.max(1, Math.round(h * data[i] / 100));
        g.fillStyle = rgb(level(data[i]), 0.85); g.fillRect(x, h - bh, bw, bh);
      }
    } else {
      var x0 = w - (data.length - 1) * step, c = level(data[data.length - 1]);
      g.beginPath(); g.moveTo(x0, h);
      data.forEach(function (v, i) { g.lineTo(x0 + i * step, h - h * v / 100); });
      g.lineTo(w, h); g.closePath(); g.fillStyle = rgb(c, 0.25); g.fill();
      g.beginPath(); data.forEach(function (v, i) { (i ? g.lineTo : g.moveTo).call(g, x0 + i * step, h - h * v / 100); });
      g.strokeStyle = rgb(c, 0.95); g.lineWidth = 1.6; g.stroke();
    }
  }

  function setMood(m) {
    if (m === shownMood) return;
    shownMood = m;
    cat.style.opacity = 0;
    setTimeout(function () { cat.src = "art/" + m + ".png"; cat.style.opacity = 1; }, 160);
  }

  function render(p) {
    var s = p.settings, themed = s.theme === "gmcat";
    panel.className = "panel " + (themed ? "gmcat" : "plain");
    panel.style.setProperty("--k", s.scale);
    panel.style.setProperty("--accent", ACCENT[p.mood] || ACCENT.happy);
    panel.hidden = false;
    setMood(p.mood);
    line.textContent = themed ? p.line : "System · " + p.word;
    var cards = { cpu: [p.cpu, p.cores + " cores" + (p.load != null ? " · load " + p.load.toFixed(2) : ""), p.histCpu],
                  mem: [p.mem, gb(p.memUsed) + " of " + gb(p.memTotal) + " GB used", p.histMem],
                  swap: [p.swap, p.swapTotal ? gb(p.swapUsed) + " of " + gb(p.swapTotal) + " GB used" + (p.swapRate > 0.05 ? " · " + p.swapRate.toFixed(1) + " MB/s" : "") : "No swap set up", p.histSwap] };
    document.querySelectorAll(".card").forEach(function (el) {
      var c = cards[el.getAttribute("data-k")], v = el.querySelector(".val");
      v.textContent = (el.getAttribute("data-k") === "swap" && !p.swapTotal) ? "–" : Math.round(c[0]) + "%";
      v.style.color = rgb(level(c[0]));
      el.querySelector(".sub").textContent = c[1];
      graph(el.querySelector("canvas"), c[2], themed);
    });
  }
  window.gmRender = render; // used by the browser test page

  var T = window.__TAURI__;
  if (T) {
    T.core.invoke("get_state").then(function (st) { render(st.payload); });
    T.event.listen("stats", function (ev) { render(ev.payload); });
  }
})();
