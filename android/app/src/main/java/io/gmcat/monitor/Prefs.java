package io.gmcat.monitor;

import android.content.Context;
import android.content.SharedPreferences;

public final class Prefs {
    public static SharedPreferences of(Context c) { return c.getSharedPreferences("gmcat-monitor", Context.MODE_PRIVATE); }
    public static boolean themed(Context c) { return of(c).getBoolean("themed", true); }
    public static boolean left(Context c) { return of(c).getBoolean("left", false); }
    public static float scale(Context c) { return of(c).getFloat("scale", 1f); }
    public static String photo(Context c) { return of(c).getString("photo", null); }
    public static boolean notify(Context c) { return of(c).getBoolean("notify", false); }
}
