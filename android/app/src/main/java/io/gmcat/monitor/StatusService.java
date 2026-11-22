package io.gmcat.monitor;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

/** Optional (off by default): a quiet notification with the cat's mood and the numbers, updated every 5 seconds. */
public class StatusService extends Service {
    static final String CH = "status";
    private final Handler h = new Handler(Looper.getMainLooper());
    private final Runnable tick = new Runnable() { public void run() { post(); h.postDelayed(this, 5000); } };

    @Override public IBinder onBind(Intent i) { return null; }

    @Override public int onStartCommand(Intent i, int flags, int id) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CH, "Status", NotificationManager.IMPORTANCE_LOW));
        Notification n = build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(1, n);
        h.removeCallbacks(tick); h.post(tick);
        return START_STICKY;
    }

    @Override public void onDestroy() { h.removeCallbacks(tick); super.onDestroy(); }

    private void post() { getSystemService(NotificationManager.class).notify(1, build()); }

    private Notification build() {
        Stats s = Stats.get(); s.update(this);
        String mood = s.mood.mood;
        boolean themed = Prefs.themed(this);
        String text = "Memory " + Math.round(s.mem) + "%"
                + (s.swapKnown && s.swapTotal > 0 ? " · Swap " + Math.round(s.swap) + "%" : "")
                + (s.battery >= 0 ? " · Battery " + Math.round(s.battery) + "%" : "")
                + (s.temp >= 0 ? " · " + Math.round(s.temp) + "°C" : "");
        Notification.Builder b = new Notification.Builder(this, CH)
                .setSmallIcon(R.drawable.ic_stat_cat)
                .setContentTitle(themed ? MoodKeeper.line(mood) : "Status: " + MoodKeeper.word(mood))
                .setContentText(text)
                .setOngoing(true).setOnlyAlertOnce(true).setShowWhen(false)
                .setContentIntent(PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE));
        if (themed) b.setLargeIcon(BitmapFactory.decodeResource(getResources(), MoodKeeper.art(mood)));
        return b.build();
    }
}
