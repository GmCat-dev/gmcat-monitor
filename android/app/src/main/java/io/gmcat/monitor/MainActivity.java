package io.gmcat.monitor;

import android.Manifest;
import android.app.Activity;
import android.app.WallpaperManager;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.CompoundButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.Switch;
import android.widget.TextView;

/** The app screen: live preview, set as wallpaper, add the widget, and the settings. */
public class MainActivity extends Activity {
    static final int PICK_PHOTO = 7, ASK_NOTIFY = 8;
    private PanelView preview;
    private LinearLayout col;
    private float dp;
    private static final int INK = 0xFFF1ECF7, MUTED = 0xFFA99FB8, ACCENT = 0xFFF08A4B, CARD = 0xFF221A2C;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        dp = getResources().getDisplayMetrics().density;
        getWindow().setStatusBarColor(0xFF17121E);
        getWindow().setNavigationBarColor(0xFF17121E);
        ScrollView sv = new ScrollView(this);
        sv.setBackgroundColor(0xFF17121E);
        sv.setFitsSystemWindows(true);
        col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        int pad = px(18);
        col.setPadding(pad, pad, pad, pad);
        sv.addView(col);

        LinearLayout head = new LinearLayout(this);
        head.setGravity(Gravity.CENTER_VERTICAL);
        ImageView logo = new ImageView(this); logo.setImageResource(R.drawable.cat_happy);
        head.addView(logo, new LinearLayout.LayoutParams(px(56), px(56)));
        LinearLayout ht = new LinearLayout(this); ht.setOrientation(LinearLayout.VERTICAL); ht.setPadding(px(12), 0, 0, 0);
        ht.addView(text("GmCat Monitor", 22, INK, true));
        ht.addView(text("Your phone's mood, at a glance.", 14, MUTED, false));
        head.addView(ht);
        col.addView(head);

        preview = new PanelView(this);
        LinearLayout.LayoutParams plp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, px(420));
        plp.topMargin = px(16);
        preview.setClipToOutline(true);
        GradientDrawable round = new GradientDrawable(); round.setCornerRadius(px(16)); round.setColor(Color.BLACK);
        preview.setBackground(round);
        col.addView(preview, plp);

        col.addView(button("Set as my live wallpaper", true, v -> setWallpaper()));
        col.addView(button("Add the home-screen widget", false, v -> addWidget()));

        LinearLayout box = card(col);
        box.addView(toggle("GmCat look (mood cat)", Prefs.themed(this), (c, on) -> save("themed", on)));
        box.addView(toggle("Panel on the left side", Prefs.left(this), (c, on) -> save("left", on)));
        box.addView(text("Panel size", 15, INK, false));
        SeekBar size = new SeekBar(this); size.setMax(90); size.setProgress(Math.round((Prefs.scale(this) - 0.7f) * 100));
        size.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            public void onProgressChanged(SeekBar s, int p, boolean u) { Prefs.of(MainActivity.this).edit().putFloat("scale", 0.7f + p / 100f).apply(); preview.invalidate(); }
            public void onStartTrackingTouch(SeekBar s) { } public void onStopTrackingTouch(SeekBar s) { } });
        box.addView(size);
        notifySwitch = toggle("Show in notifications (uses a little battery)", Prefs.notify(this), (c, on) -> setNotify(on));
        box.addView(notifySwitch);
        if (Prefs.notify(this)) setNotify(true); // keep it running after the app was closed

        LinearLayout bgBox = card(col);
        bgBox.addView(text("Wallpaper background", 15, INK, true));
        LinearLayout row = new LinearLayout(this);
        row.addView(button("GmCat night", false, v -> { Prefs.of(this).edit().remove("photo").apply(); preview.invalidate(); }), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        row.addView(button("Choose a photo…", false, v -> pickPhoto()), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        bgBox.addView(row);

        LinearLayout info = card(col);
        info.addView(text("Android doesn't let apps read the processor, so on a phone I watch memory, swap, battery and heat instead. I get sweaty when the phone runs hot.", 14, MUTED, false));
        info.addView(text("No internet permission: nothing ever leaves your phone.", 14, MUTED, false));
        TextView src = text("Source code · apps.gmcat.io", 14, ACCENT, true);
        src.setPadding(0, px(8), 0, 0);
        src.setOnClickListener(v -> { try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://apps.gmcat.io/monitor/"))); } catch (Exception ignored) { } });
        info.addView(src);
        TextView ver = text("Version " + BuildInfo.version(this), 12, MUTED, false); info.addView(ver);
        setContentView(sv);
    }

    private void save(String k, boolean on) { Prefs.of(this).edit().putBoolean(k, on).apply(); preview.invalidate(); CatWidget.refreshAll(this); }

    private void setWallpaper() {
        try {
            Intent i = new Intent(WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER);
            i.putExtra(WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT, new ComponentName(this, CatWallpaper.class));
            startActivity(i);
        } catch (Exception e) {
            try { startActivity(new Intent(WallpaperManager.ACTION_LIVE_WALLPAPER_CHOOSER)); } catch (Exception ignored) { }
        }
    }

    private void addWidget() {
        AppWidgetManager m = getSystemService(AppWidgetManager.class);
        if (m != null && m.isRequestPinAppWidgetSupported()) m.requestPinAppWidget(new ComponentName(this, CatWidget.class), null, null);
        else note("Long-press your home screen, tap Widgets, and find GmCat Monitor.");
    }

    private void pickPhoto() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT); i.addCategory(Intent.CATEGORY_OPENABLE); i.setType("image/*");
        startActivityForResult(i, PICK_PHOTO);
    }

    private Switch notifySwitch;

    private void setNotify(boolean on) {
        Prefs.of(this).edit().putBoolean("notify", on).apply();
        Intent svc = new Intent(this, StatusService.class);
        if (!on) { stopService(svc); return; }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, ASK_NOTIFY); // starts after "Allow"
            return;
        }
        startForegroundService(svc);
    }

    @Override public void onRequestPermissionsResult(int req, String[] perms, int[] res) {
        if (req != ASK_NOTIFY) return;
        if (res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED) startForegroundService(new Intent(this, StatusService.class));
        else {
            Prefs.of(this).edit().putBoolean("notify", false).apply();
            if (notifySwitch != null) notifySwitch.setChecked(false);
            note("Notifications are off for GmCat Monitor. You can allow them in Android Settings → Apps.");
        }
    }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        if (req == PICK_PHOTO && res == RESULT_OK && data != null && data.getData() != null) {
            Uri u = data.getData();
            try { getContentResolver().takePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (Exception ignored) { }
            Prefs.of(this).edit().putString("photo", u.toString()).apply();
            preview.invalidate();
        }
    }

    // ---- small view helpers
    private int px(float v) { return Math.round(v * dp); }
    private TextView text(String t, float sp, int color, boolean bold) {
        TextView v = new TextView(this); v.setText(t); v.setTextSize(sp); v.setTextColor(color);
        if (bold) v.setTypeface(Typeface.DEFAULT_BOLD);
        v.setPadding(0, px(4), 0, px(4));
        return v;
    }
    private Button button(String t, boolean primary, View.OnClickListener l) {
        Button b = new Button(this); b.setText(t); b.setAllCaps(false); b.setTextSize(15);
        b.setTextColor(primary ? 0xFF2A1408 : INK);
        GradientDrawable d = new GradientDrawable(); d.setCornerRadius(px(10)); d.setColor(primary ? ACCENT : CARD); d.setStroke(px(1), primary ? ACCENT : 0xFF352D40);
        b.setBackground(d); b.setOnClickListener(l);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, px(48));
        lp.topMargin = px(10); lp.leftMargin = px(2); lp.rightMargin = px(2);
        b.setLayoutParams(lp);
        return b;
    }
    private Switch toggle(String t, boolean on, CompoundButton.OnCheckedChangeListener l) {
        Switch s = new Switch(this); s.setText(t); s.setTextColor(INK); s.setTextSize(15); s.setChecked(on);
        s.setPadding(0, px(10), 0, px(10)); s.setOnCheckedChangeListener(l);
        return s;
    }
    private LinearLayout card(LinearLayout parent) {
        LinearLayout c = new LinearLayout(this); c.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable d = new GradientDrawable(); d.setCornerRadius(px(14)); d.setColor(CARD); d.setStroke(px(1), 0xFF352D40);
        c.setBackground(d); c.setPadding(px(16), px(10), px(16), px(12));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = px(14); parent.addView(c, lp);
        return c;
    }
    private void note(String t) {
        TextView v = text(t, 14, ACCENT, true);
        col.addView(v, Math.min(4, col.getChildCount()));
    }
}
