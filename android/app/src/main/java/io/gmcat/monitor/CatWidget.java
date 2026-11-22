package io.gmcat.monitor;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

/** Home-screen widget: the cat + memory, swap/storage and battery heat. */
public class CatWidget extends AppWidgetProvider {
    @Override public void onUpdate(Context c, AppWidgetManager m, int[] ids) { Stats.get().update(c); push(c, m, ids); }

    public static void refreshAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, CatWidget.class));
        if (ids.length > 0) push(c, m, ids);
    }

    static void push(Context c, AppWidgetManager m, int[] ids) {
        Stats s = Stats.get();
        String mood = s.mood.mood;
        boolean themed = Prefs.themed(c);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget);
        v.setImageViewResource(R.id.w_cat, MoodKeeper.art(mood));
        v.setViewVisibility(R.id.w_cat, themed ? android.view.View.VISIBLE : android.view.View.GONE);
        v.setTextViewText(R.id.w_line, themed ? MoodKeeper.line(mood) : "Phone · " + MoodKeeper.word(mood));
        v.setTextViewText(R.id.w_mem, "Memory " + Math.round(s.mem) + "%");
        v.setTextViewText(R.id.w_swap, s.swapKnown && s.swapTotal > 0 ? "Swap " + Math.round(s.swap) + "%" : "Storage " + Math.round(s.storage) + "%");
        v.setTextViewText(R.id.w_heat, (s.battery >= 0 ? "Battery " + Math.round(s.battery) + "%" : "Battery") + (s.temp >= 0 ? " · " + Math.round(s.temp) + "°C" : ""));
        Intent open = new Intent(c, MainActivity.class);
        v.setOnClickPendingIntent(R.id.w_root, PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        m.updateAppWidget(ids, v);
    }
}
