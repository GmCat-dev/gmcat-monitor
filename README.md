# GmCat Monitor

See how hard your computer is working: processor, memory and swap, in your tray / menu bar / top bar and on your
desktop. A little GmCat changes mood as things get busy (napping, purring, working hard, sweaty, on fire, queasy),
or pick the plain look.

**Download:** https://apps.gmcat.io/monitor/ · **Install help:** https://apps.gmcat.io/install-help/

**Collects nothing.** GmCat Monitor never goes online. It only reads your computer's own numbers.

## What's here

| Folder | What | Built with |
|---|---|---|
| `gnome/` | Linux GNOME Shell extension (top bar + desktop panel) | GJS, GNOME Shell 3.36 |
| `desktop/` | Windows, Mac and Linux app (tray / menu bar + desktop panel + Settings) | Tauri 2 (Rust + web view) |
| `art/` | The GmCat mood pictures | |

## Check a download

Every release file is built by GitHub Actions from this code (see `.github/workflows/build.yml`) with a signed build
attestation:

```
gh attestation verify GmCat-Monitor-0.1.0-windows-setup.exe --repo GmCat-dev/gmcat-monitor
```

or compare its SHA-256 with `SHA256SUMS.txt` on the release page.

## Build it yourself

Desktop app (needs Rust, Node 20; on Linux also `libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev`):

```
cd desktop && npm install && npx tauri build
```

GNOME extension:

```
cd gnome/gmcat-monitor@gmcat.io && glib-compile-schemas schemas
cp -r . ~/.local/share/gnome-shell/extensions/gmcat-monitor@gmcat.io
gnome-extensions enable gmcat-monitor@gmcat.io   # then reload GNOME (X11: Alt+F2, r)
```

Tests: `rustc --edition 2021 --test desktop/src-tauri/src/mood.rs -o mood-test && ./mood-test` and
`cd desktop && node tests/ui_test.mjs` (needs puppeteer).

## How the mood works

| Mood | When |
|---|---|
| Napping | processor under 6% and memory under 75% for 30 seconds |
| Purring along | normal use |
| Working hard | processor 30%+ or memory 82%+ |
| Getting sweaty | processor 65%+ or memory 90%+ |
| On fire | processor 90%+ or memory 96%+ |
| Queasy | swap moving more than 1 MB/s (Linux), or swap 80%+ and memory 88%+ full |

A new mood has to hold for two updates before the cat changes, so she doesn't flicker.

## Licence

Code: AGPL-3.0 (see `LICENSE`). Commercial licence available, see `COMMERCIAL.md`.
The GmCat name, character and artwork are GmCat's and are not covered by the code licence.

Security problems: please use GitHub's private **Report a vulnerability** button on this repository.
