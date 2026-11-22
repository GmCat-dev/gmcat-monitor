package io.gmcat.monitor;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;
import java.util.HashMap;
import java.util.Locale;

/** Draws the GmCat Monitor panel (same look as the desktop panel) onto any Canvas. */
public final class Renderer {
    private final Context ctx;
    private final HashMap<String, Bitmap> art = new HashMap<>();
    private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG), bmp = new Paint(Paint.FILTER_BITMAP_FLAG | Paint.ANTI_ALIAS_FLAG);

    public Renderer(Context c) { ctx = c.getApplicationContext(); }

    public Bitmap cat(String mood) {
        Bitmap b = art.get(mood);
        if (b == null) { b = BitmapFactory.decodeResource(ctx.getResources(), MoodKeeper.art(mood)); art.put(mood, b); }
        return b;
    }

    static int level(double v) { return v < 60 ? 0xFF5FD168 : v < 80 ? 0xFFF2C14E : v < 92 ? 0xFFF08A4B : 0xFFEF5B5B; }
    static int heatColor(double t) { return t < 0 ? 0xFFB8BDE8 : t < 38 ? 0xFF5FD168 : t < 42 ? 0xFFF2C14E : t < 45 ? 0xFFF08A4B : 0xFFEF5B5B; }

    /** Panel height for a given width (px), so callers can centre it. */
    public float height(float w, float dp, boolean themed) {
        float k = w / (270 * dp);
        float h = 14 * dp * k * 2 + (themed ? 128 * dp * k + 6 * dp * k : 0) + 22 * dp * k;
        return h + 3 * (card(dp * k) + 10 * dp * k);
    }

    private static float card(float u) { return 8 * u + 30 * u + 3 * u + 44 * u + 3 * u + 16 * u + 8 * u; }

    public void draw(Canvas c, float x, float y, float w, float dp, boolean themed, Stats s, String mood) {
        float u = dp * (w / (270 * dp));   // one "design pixel", scaled
        float h = height(w, dp, themed);
        Typeface face = themed ? Typeface.create(Typeface.MONOSPACE, Typeface.BOLD) : Typeface.create(Typeface.DEFAULT, Typeface.BOLD);
        Typeface faceN = themed ? Typeface.MONOSPACE : Typeface.DEFAULT;
        RectF box = new RectF(x, y, x + w, y + h);
        p.setStyle(Paint.Style.FILL);
        if (themed) {
            p.setColor(0xD1221A2E); c.drawRect(box, p);
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(3 * u); p.setColor(MoodKeeper.accent(mood));
            c.drawRect(box, p); p.setStyle(Paint.Style.FILL);
        } else {
            p.setColor(0x99121216); c.drawRoundRect(box, 14 * u, 14 * u, p);
        }
        float cy = y + 14 * u;
        String line = themed ? MoodKeeper.line(mood) : "Phone · " + MoodKeeper.word(mood);
        if (themed) {
            Bitmap b = cat(mood);
            float cs = 128 * u;
            c.drawBitmap(b, null, new RectF(x + (w - cs) / 2, cy, x + (w + cs) / 2, cy + cs), bmp);
            cy += cs + 6 * u;
        }
        p.setTypeface(face); p.setColor(0xFFF4F1FF); p.setTextSize(15 * u);
        if (themed) { p.setTextAlign(Paint.Align.CENTER); c.drawText(fit(line, w - 24 * u), x + w / 2, cy + 15 * u, p); }
        else { p.setTextAlign(Paint.Align.LEFT); c.drawText(line, x + 16 * u, cy + 15 * u, p); }
        cy += 22 * u + 10 * u;

        String memSub = Stats.gb(s.memUsed) + " of " + Stats.gb(s.memTotal) + " GB used";
        drawCard(c, x + 16 * u, cy, w - 32 * u, u, themed, face, faceN, "Memory", pct(s.mem), level(s.mem), memSub, s.histMem, s.count, false);
        cy += card(u) + 10 * u;
        if (s.swapKnown && s.swapTotal > 0) {
            drawCard(c, x + 16 * u, cy, w - 32 * u, u, themed, face, faceN, "Swap", pct(s.swap), level(s.swap),
                    Stats.gb(s.swapUsed) + " of " + Stats.gb(s.swapTotal) + " GB used", s.histSwap, s.count, false);
        } else {
            drawCard(c, x + 16 * u, cy, w - 32 * u, u, themed, face, faceN, "Storage", pct(s.storage), level(s.storage),
                    Stats.gb(s.storeUsed) + " of " + Stats.gb(s.storeTotal) + " GB used", s.histSwap, s.count, false);
        }
        cy += card(u) + 10 * u;
        String tw = s.thermalWord();
        String heatSub = (s.battery >= 0 ? "Battery " + Math.round(s.battery) + "%" + (s.charging ? " ⚡" : "") : "Battery") + (tw != null ? " · " + tw : "");
        drawCard(c, x + 16 * u, cy, w - 32 * u, u, themed, face, faceN, "Heat",
                s.temp < 0 ? "–" : String.format(Locale.US, "%.0f°C", s.temp), heatColor(s.temp), heatSub, s.histTemp, s.count, true);
    }

    private static String pct(double v) { return Math.round(v) + "%"; }

    private String fit(String t, float max) { while (t.length() > 4 && p.measureText(t) > max) t = t.substring(0, t.length() - 2) + "…"; return t; }

    private void drawCard(Canvas c, float x, float y, float w, float u, boolean themed, Typeface face, Typeface faceN,
                          String name, String val, int valColor, String sub, float[] hist, int count, boolean heat) {
        float h = card(u);
        RectF r = new RectF(x, y, x + w, y + h);
        p.setStyle(Paint.Style.FILL);
        if (themed) { p.setColor(0xDB3D2C4C); c.drawRect(r, p); p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(2 * u); p.setColor(0x1AFFFFFF); c.drawRect(r, p); p.setStyle(Paint.Style.FILL); }
        else { p.setColor(0x12FFFFFF); c.drawRoundRect(r, 10 * u, 10 * u, p); }
        float ix = x + 10 * u, iw = w - 20 * u, cy = y + 8 * u;
        p.setTextAlign(Paint.Align.LEFT); p.setTypeface(face); p.setTextSize(13.5f * u); p.setColor(themed ? 0xFFD9DCFF : 0xD9FFFFFF);
        c.drawText(name, ix, cy + 26 * u, p);
        p.setTextAlign(Paint.Align.RIGHT); p.setTextSize(24 * u); p.setColor(valColor);
        c.drawText(val, ix + iw, cy + 26 * u, p);
        cy += 30 * u + 3 * u;
        // graph
        float gh = 44 * u;
        p.setColor(0x14FFFFFF); p.setStrokeWidth(1);
        for (float f : new float[]{0.5f, 0.8f}) c.drawLine(ix, cy + gh - gh * f, ix + iw, cy + gh - gh * f, p);
        int n = Math.min(count, hist.length);
        if (n > 1) {
            float step = iw / (Stats.HISTORY - 1);
            if (themed) {
                float bw = Math.max(2, (float) Math.floor(step * 2));
                float gx = ix + iw - bw;
                for (int i = hist.length - 1; i >= hist.length - n && gx > ix - bw; i -= 2, gx -= bw + u) {
                    float bh = Math.max(1, gh * hist[i] / 100f);
                    p.setColor((heat ? heatColor(20 + hist[i] * 0.3) : level(hist[i])) & 0xD9FFFFFF);
                    c.drawRect(Math.max(ix, gx), cy + gh - bh, gx + bw, cy + gh, p);
                }
            } else {
                int col = heat ? heatColor(20 + hist[hist.length - 1] * 0.3) : level(hist[hist.length - 1]);
                Path fill = new Path(), ln = new Path();
                float x0 = ix + iw - (n - 1) * step;
                fill.moveTo(x0, cy + gh);
                for (int i = 0; i < n; i++) {
                    float px = x0 + i * step, py = cy + gh - gh * hist[hist.length - n + i] / 100f;
                    fill.lineTo(px, py); if (i == 0) ln.moveTo(px, py); else ln.lineTo(px, py);
                }
                fill.lineTo(ix + iw, cy + gh); fill.close();
                p.setColor((col & 0x00FFFFFF) | 0x40000000); c.drawPath(fill, p);
                p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1.6f * u); p.setColor(col); c.drawPath(ln, p); p.setStyle(Paint.Style.FILL);
            }
        }
        cy += gh + 3 * u;
        p.setTextAlign(Paint.Align.LEFT); p.setTypeface(faceN); p.setTextSize(11.5f * u); p.setColor(0xB8FFFFFF);
        c.drawText(fit(sub, iw), ix, cy + 12 * u, p);
    }
}
