package io.gmcat.monitor;

import android.content.Context;
import android.graphics.Canvas;
import android.view.View;

/** Live preview of the wallpaper inside the app. */
public class PanelView extends View {
    private final Renderer r; private final Background bg = new Background();
    private final Runnable tick = new Runnable() { public void run() { Stats.get().update(getContext()); invalidate(); postDelayed(this, 2000); } };

    public PanelView(Context c) { super(c); r = new Renderer(c); }
    @Override protected void onAttachedToWindow() { super.onAttachedToWindow(); post(tick); }
    @Override protected void onDetachedFromWindow() { removeCallbacks(tick); super.onDetachedFromWindow(); }

    @Override protected void onDraw(Canvas c) {
        int w = getWidth(), h = getHeight();
        bg.draw(getContext(), c, w, h);
        float dp = getResources().getDisplayMetrics().density;
        boolean themed = Prefs.themed(getContext());
        float pw = Math.min(w * 0.62f, 200 * dp * Prefs.scale(getContext()));
        float ph = r.height(pw, dp, themed);
        if (ph > h - 16 * dp) { pw = pw * (h - 16 * dp) / ph; ph = r.height(pw, dp, themed); }
        float x = Prefs.left(getContext()) ? 12 * dp : w - pw - 12 * dp;
        Stats s = Stats.get();
        r.draw(c, x, (h - ph) / 2, pw, dp, themed, s, s.mood.mood);
    }
}
