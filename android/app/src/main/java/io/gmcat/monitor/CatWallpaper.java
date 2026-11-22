package io.gmcat.monitor;

import android.graphics.Canvas;
import android.os.Handler;
import android.os.Looper;
import android.service.wallpaper.WallpaperService;
import android.view.SurfaceHolder;

/** Live wallpaper: the GmCat panel on your home screen. Only works while the home screen is on view. */
public class CatWallpaper extends WallpaperService {
    @Override public Engine onCreateEngine() { return new CatEngine(); }

    class CatEngine extends Engine {
        private final Handler h = new Handler(Looper.getMainLooper());
        private final Renderer r = new Renderer(CatWallpaper.this);
        private final Background bg = new Background();
        private boolean visible; private long lastWidget;
        private final Runnable tick = new Runnable() { public void run() { frame(); if (visible) h.postDelayed(this, 2000); } };

        @Override public void onVisibilityChanged(boolean v) {
            visible = v; h.removeCallbacks(tick);
            if (v) h.post(tick);
        }
        @Override public void onSurfaceChanged(SurfaceHolder s, int f, int w, int hh) { super.onSurfaceChanged(s, f, w, hh); frame(); }
        @Override public void onDestroy() { visible = false; h.removeCallbacks(tick); super.onDestroy(); }

        void frame() {
            Stats s = Stats.get();
            s.update(CatWallpaper.this);
            SurfaceHolder sh = getSurfaceHolder();
            Canvas c = null;
            try {
                c = sh.lockCanvas();
                if (c == null) return;
                int w = c.getWidth(), hh = c.getHeight();
                bg.draw(CatWallpaper.this, c, w, hh);
                float dp = getResources().getDisplayMetrics().density;
                boolean themed = Prefs.themed(CatWallpaper.this);
                // fit between the status bar and the dock / search bar
                float top = 96 * dp, bottom = hh - 220 * dp, avail = Math.max(200 * dp, bottom - top);
                float pw = Math.min(w * 0.55f, 200 * dp * Prefs.scale(CatWallpaper.this));
                float ph = r.height(pw, dp, themed);
                if (ph > avail) { pw = pw * avail / ph; ph = r.height(pw, dp, themed); }
                float x = Prefs.left(CatWallpaper.this) ? 16 * dp : w - pw - 16 * dp;
                float y = top + (avail - ph) / 2;
                r.draw(c, x, y, pw, dp, themed, s, s.mood.mood);
            } finally { if (c != null) try { sh.unlockCanvasAndPost(c); } catch (Exception ignored) { } }
            long now = System.currentTimeMillis();
            if (now - lastWidget > 30000) { lastWidget = now; CatWidget.refreshAll(CatWallpaper.this); }
        }
    }
}
