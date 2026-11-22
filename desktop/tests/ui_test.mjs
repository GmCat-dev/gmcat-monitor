// Browser test for the desktop panel + settings screens (no Tauri needed): feeds sample numbers, checks the page
// reacts, saves screenshots to tests/out/. Run: node tests/ui_test.mjs   (needs puppeteer)
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const puppeteer = require(process.env.PUPPETEER_PATH || 'puppeteer');
const here = path.dirname(fileURLToPath(import.meta.url));
const ui = path.resolve(here, '../ui');
const out = path.join(here, 'out'); fs.mkdirSync(out, { recursive: true });
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('FAIL', msg); } };
const hist = n => Array.from({ length: 90 }, (_, i) => Math.max(0, Math.min(100, n + 20 * Math.sin(i / 7))));
const sample = (mood, theme, extra = {}) => ({
  cpu: 34, cpuAvg: 30, mem: 65, memUsed: 4.6e9, memTotal: 7.6e9, swap: 68, swapUsed: 2.9e9, swapTotal: 4.29e9,
  swapRate: 0.4, swapRateAvg: 0.3, cores: 8, load: 1.33, histCpu: hist(30), histMem: hist(65), histSwap: hist(68), top: [],
  mood, line: { happy: 'Purring along.', overload: 'On fire! Too much going on.', sleepy: 'Napping. All quiet.' }[mood] || 'Working hard.',
  word: 'Normal', settings: { theme, showDesktop: true, side: 'right', scale: 1, refreshSeconds: 2, trayNumbers: true, pinToWallpaper: false, welcomed: true },
  ...extra });
const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
const errs = [];
const pg = await b.newPage(); pg.on('pageerror', e => errs.push(e.message));
await pg.setViewport({ width: 300, height: 720 });
await pg.goto('file://' + ui + '/panel.html');
for (const [mood, theme] of [['happy', 'gmcat'], ['overload', 'gmcat'], ['sleepy', 'gmcat'], ['happy', 'plain']]) {
  await pg.evaluate(p => window.gmRender(p), sample(mood, theme));
  await new Promise(r => setTimeout(r, 450));
  await pg.evaluate(() => document.body.style.background = '#6b2a5a'); // stand-in wallpaper for the screenshot
  await pg.screenshot({ path: `${out}/panel-${theme}-${mood}.png` });
  const st = await pg.evaluate(() => ({ cls: document.getElementById('panel').className, src: document.getElementById('cat').getAttribute('src'),
    line: document.getElementById('line').textContent, vals: [...document.querySelectorAll('.val')].map(v => v.textContent) }));
  ok(st.cls.includes(theme), `${mood}/${theme} class ${st.cls}`);
  ok(theme !== 'gmcat' || st.src === `art/${mood}.png`, `${mood} art ${st.src}`);
  ok(JSON.stringify(st.vals) === '["34%","65%","68%"]', `values ${st.vals}`);
  ok(theme === 'gmcat' ? st.line.length > 5 : st.line.startsWith('System ·'), `line ${st.line}`);
}
await pg.evaluate(p => window.gmRender(p), sample('happy', 'gmcat', { swapTotal: 0, swap: 0 }));
ok(await pg.evaluate(() => document.querySelectorAll('.val')[2].textContent) === '–', 'no swap shows a dash');
await pg.evaluate(p => window.gmRender(p), sample('happy', 'gmcat', { settings: { ...sample('happy', 'gmcat').settings, scale: 0.7 } }));
ok(await pg.evaluate(() => document.getElementById('panel').getBoundingClientRect().width) < 200, 'scale 0.7 shrinks the panel');
// settings
const sp = await b.newPage(); sp.on('pageerror', e => errs.push(e.message));
await sp.setViewport({ width: 480, height: 760 });
for (const os of ['windows', 'macos']) {
  await sp.goto('file://' + ui + '/settings.html?welcome=1');
  await sp.evaluate((p, os) => window.gmFill({ payload: p, autostart: true, os, version: '0.1.0' }), sample('happy', 'gmcat'), os);
  await sp.screenshot({ path: `${out}/settings-${os}.png`, fullPage: true });
  const s = await sp.evaluate(() => ({ win: !document.querySelector('.win-only').hidden, mac: !document.querySelector('.mac-only').hidden,
    welcome: !document.getElementById('welcome').hidden, where: document.getElementById('where').textContent, theme: document.getElementById('theme').value }));
  ok(s.welcome && s.theme === 'gmcat', `${os} welcome + theme`);
  ok(os === 'windows' ? (s.win && !s.mac && /tray/.test(s.where)) : (s.mac && !s.win && /menu bar/.test(s.where)), `${os} rows ${JSON.stringify(s)}`);
}
ok(errs.length === 0, 'page errors: ' + errs.join(' | '));
await b.close();
console.log(`${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
