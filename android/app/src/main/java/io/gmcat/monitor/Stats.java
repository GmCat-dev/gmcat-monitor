package io.gmcat.monitor;

import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Environment;
import android.os.PowerManager;
import android.os.StatFs;
import java.io.BufferedReader;
import java.io.FileReader;

/** What Android lets an app read: memory, swap (zram), storage, battery and heat. Android 8+ hides the processor. */
public final class Stats {
    public static final int HISTORY = 90;
    private static Stats one;
    public static synchronized Stats get() { if (one == null) one = new Stats(); return one; }

    public double mem, swap, storage, battery = -1, temp = -1;
    public long memUsed, memTotal, swapUsed, swapTotal, storeUsed, storeTotal;
    public boolean charging, swapKnown;
    public int thermal = -1;       // PowerManager THERMAL_STATUS_* (Android 10+), -1 unknown
    public long updatedAt;
    public final float[] histMem = new float[HISTORY], histSwap = new float[HISTORY], histTemp = new float[HISTORY];
    public int count;
    public final MoodKeeper mood = new MoodKeeper();

    public synchronized void update(Context c) {
        ActivityManager am = (ActivityManager) c.getSystemService(Context.ACTIVITY_SERVICE);
        ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
        am.getMemoryInfo(mi);
        memTotal = mi.totalMem; memUsed = mi.totalMem - mi.availMem;
        mem = memTotal > 0 ? 100.0 * memUsed / memTotal : 0;

        swapKnown = false;
        try (BufferedReader r = new BufferedReader(new FileReader("/proc/meminfo"))) {
            long st = -1, sf = -1; String l;
            while ((l = r.readLine()) != null) {
                if (l.startsWith("SwapTotal:")) st = kb(l); else if (l.startsWith("SwapFree:")) sf = kb(l);
            }
            if (st >= 0 && sf >= 0) { swapTotal = st; swapUsed = st - sf; swapKnown = true; }
        } catch (Exception ignored) { }
        swap = swapKnown && swapTotal > 0 ? 100.0 * swapUsed / swapTotal : 0;

        try {
            StatFs fs = new StatFs(Environment.getDataDirectory().getPath());
            storeTotal = fs.getTotalBytes(); storeUsed = storeTotal - fs.getAvailableBytes();
            storage = storeTotal > 0 ? 100.0 * storeUsed / storeTotal : 0;
        } catch (Exception ignored) { }

        Intent b = c.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (b != null) {
            int lvl = b.getIntExtra(BatteryManager.EXTRA_LEVEL, -1), sc = b.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
            battery = lvl >= 0 && sc > 0 ? 100.0 * lvl / sc : -1;
            int t = b.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Integer.MIN_VALUE);
            temp = t == Integer.MIN_VALUE ? -1 : t / 10.0;
            int st = b.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
            charging = st == BatteryManager.BATTERY_STATUS_CHARGING || st == BatteryManager.BATTERY_STATUS_FULL;
        }
        if (Build.VERSION.SDK_INT >= 29) {
            PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
            thermal = pm.getCurrentThermalStatus();
        }

        long now = System.currentTimeMillis();
        double dt = updatedAt == 0 ? 2 : Math.min(60, (now - updatedAt) / 1000.0);
        updatedAt = now;
        push(histMem, (float) mem);
        push(histSwap, (float) (swapKnown ? swap : storage));
        push(histTemp, (float) heatPct());
        if (count < HISTORY) count++;
        mood.judge(this, dt);
    }

    /** battery temperature 20..50 °C shown as 0..100 for the graph */
    public double heatPct() { return temp < 0 ? 0 : Math.max(0, Math.min(100, (temp - 20) * 100 / 30.0)); }

    public String thermalWord() {
        switch (thermal) {
            case 0: return "cool"; case 1: return "warm"; case 2: return "hot"; case 3: return "very hot";
            case 4: case 5: case 6: return "too hot"; default: return null;
        }
    }

    private static void push(float[] h, float v) { System.arraycopy(h, 1, h, 0, h.length - 1); h[h.length - 1] = v; }
    private static long kb(String l) { return Long.parseLong(l.replaceAll("[^0-9]", "")) * 1024L; }
    public static String gb(long b) { return String.format(java.util.Locale.US, "%.1f", b / 1073741824.0); }
}
