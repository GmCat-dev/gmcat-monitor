package io.gmcat.monitor;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.Shader;
import android.net.Uri;
import java.io.InputStream;

/** The wallpaper behind the panel: GmCat night gradient, or the person's own photo (center-cropped). */
public final class Background {
    private Bitmap photo; private String photoUri; private int pw, ph;
    private final Paint paint = new Paint(Paint.FILTER_BITMAP_FLAG);

    public void draw(Context c, Canvas cv, int w, int h) {
        String uri = Prefs.photo(c);
        if (uri != null && (photo == null || !uri.equals(photoUri) || pw != w || ph != h)) load(c, uri, w, h);
        if (uri == null) photo = null;
        if (photo != null) {
            float s = Math.max((float) w / photo.getWidth(), (float) h / photo.getHeight());
            int sw = Math.round(w / s), sh = Math.round(h / s);
            int sx = (photo.getWidth() - sw) / 2, sy = (photo.getHeight() - sh) / 2;
            cv.drawBitmap(photo, new Rect(sx, sy, sx + sw, sy + sh), new Rect(0, 0, w, h), paint);
        } else {
            Paint g = new Paint();
            g.setShader(new LinearGradient(0, 0, w * 0.3f, h, 0xFF2B1D3A, 0xFF5A2A5E, Shader.TileMode.CLAMP));
            cv.drawRect(0, 0, w, h, g);
            Paint star = new Paint(Paint.ANTI_ALIAS_FLAG); star.setColor(0x55FFFFFF);
            java.util.Random r = new java.util.Random(7);
            float d = c.getResources().getDisplayMetrics().density;
            for (int i = 0; i < 60; i++) { float x = r.nextFloat() * w, y = r.nextFloat() * h * 0.7f, s = (r.nextInt(2) + 1) * d; cv.drawRect(x, y, x + s, y + s, star); }
        }
    }

    private void load(Context c, String uri, int w, int h) {
        photoUri = uri; pw = w; ph = h; photo = null;
        try {
            BitmapFactory.Options o = new BitmapFactory.Options(); o.inJustDecodeBounds = true;
            try (InputStream in = c.getContentResolver().openInputStream(Uri.parse(uri))) { BitmapFactory.decodeStream(in, null, o); }
            int sample = 1; while (o.outWidth / (sample * 2) >= w && o.outHeight / (sample * 2) >= h) sample *= 2;
            BitmapFactory.Options o2 = new BitmapFactory.Options(); o2.inSampleSize = sample;
            try (InputStream in = c.getContentResolver().openInputStream(Uri.parse(uri))) { photo = BitmapFactory.decodeStream(in, null, o2); }
        } catch (Exception e) { photo = null; }
    }
}
