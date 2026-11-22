package io.gmcat.monitor;

/** The cat's mood on a phone. A new mood must hold for 2 updates before she changes (no flicker). */
public final class MoodKeeper {
    public static final String[] KEYS = {"sleepy", "happy", "busy", "stressed", "overload", "swapping"};
    public String mood = "happy";
    private String cand; private int n;

    public static String wanted(Stats s) {
        double m = s.mem, t = s.temp; int th = s.thermal;
        if (s.swapKnown && s.swap >= 80 && m >= 90) return "swapping";
        if (th >= 3 || m >= 97 || t >= 47) return "overload";
        if (th == 2 || m >= 93 || t >= 43) return "stressed";
        if (th == 1 || m >= 88 || t >= 40) return "busy";
        if (s.charging) return "sleepy";
        return "happy";
    }

    public synchronized String judge(Stats s, double dt) {
        String w = wanted(s);
        if (w.equals(mood)) { cand = null; return mood; }
        if (w.equals(cand)) n++; else { cand = w; n = 1; }
        if (n >= 2 || dt > 20) { mood = w; cand = null; } // after a long gap (widget), trust the fresh reading
        return mood;
    }

    public static String line(String mood) {
        switch (mood) {
            case "sleepy": return "Napping while you charge.";
            case "busy": return "Working hard.";
            case "stressed": return "Getting sweaty…";
            case "overload": return "On fire! Very busy or hot.";
            case "swapping": return "Swap is making me queasy.";
            default: return "Purring along.";
        }
    }

    public static String word(String mood) {
        switch (mood) {
            case "sleepy": return "Charging"; case "busy": return "Busy"; case "stressed": return "Heavy";
            case "overload": return "Overloaded"; case "swapping": return "Swapping a lot"; default: return "Normal";
        }
    }

    public static int art(String mood) {
        switch (mood) {
            case "sleepy": return R.drawable.cat_sleepy; case "busy": return R.drawable.cat_busy;
            case "stressed": return R.drawable.cat_stressed; case "overload": return R.drawable.cat_overload;
            case "swapping": return R.drawable.cat_swapping; default: return R.drawable.cat_happy;
        }
    }

    public static int accent(String mood) {
        switch (mood) {
            case "sleepy": return 0xFF8F93B8; case "busy": return 0xFF7FB6FF; case "stressed": return 0xFFF2C14E;
            case "overload": return 0xFFEF5B5B; case "swapping": return 0xFF8FDC5A; default: return 0xFFB8BDE8;
        }
    }
}
