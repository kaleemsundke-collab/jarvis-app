package expo.modules.jarvisnative

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build

object JarvisAlerts {
  fun post(ctx: Context, title: String, text: String, id: Int = 7001): Boolean {
    return try {
      val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
      if (Build.VERSION.SDK_INT >= 26) {
        val ch = NotificationChannel("jarvis_alert", "Jarvis alerts", NotificationManager.IMPORTANCE_HIGH)
        ch.enableVibration(true); ch.vibrationPattern = longArrayOf(0, 600, 300, 600, 300, 600)
        ch.setSound(uri, AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).build())
        nm.createNotificationChannel(ch)
      }
      val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
      val pi = PendingIntent.getActivity(ctx, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0))
      val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(ctx, "jarvis_alert") else Notification.Builder(ctx)
      b.setSmallIcon(ctx.applicationInfo.icon).setContentTitle(title).setContentText(text)
        .setStyle(Notification.BigTextStyle().bigText(text)).setAutoCancel(true).setContentIntent(pi)
        .setCategory(Notification.CATEGORY_CALL).setFullScreenIntent(pi, true)
      if (Build.VERSION.SDK_INT < 26) { b.setSound(uri); b.setPriority(Notification.PRIORITY_MAX) }
      nm.notify(id, b.build())
      true
    } catch (e: Exception) { false }
  }
}

class JarvisAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val t = intent.getStringExtra("title") ?: "Jarvis reminder"
    val x = intent.getStringExtra("text") ?: ""
    JarvisAlerts.post(context, t, x, 7100 + (intent.getIntExtra("id", 0) % 800))
  }
}
