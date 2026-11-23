package expo.modules.jarvisnative

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import android.telecom.TelecomManager
import android.telephony.SmsManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class JarvisNativeModule : Module() {
  private val ctx: Context
    get() = appContext.reactContext ?: throw IllegalStateException("No Android context")

  private fun has(p: String) = ctx.checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED

  @SuppressLint("MissingPermission")
  override fun definition() = ModuleDefinition {
    Name("JarvisNative")

    Events("onNotification", "onCall")

    Function("alertMe") { title: String, text: String ->
      try {
        val ctx = appContext.reactContext ?: return@Function false
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
        val uri = android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_RINGTONE)
        if (Build.VERSION.SDK_INT >= 26) {
          val ch = android.app.NotificationChannel("jarvis_alert", "Jarvis alerts", android.app.NotificationManager.IMPORTANCE_HIGH)
          ch.enableVibration(true); ch.vibrationPattern = longArrayOf(0, 600, 300, 600, 300, 600)
          ch.setSound(uri, android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION_RINGTONE).build())
          nm.createNotificationChannel(ch)
        }
        val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
        val pi = android.app.PendingIntent.getActivity(ctx, 0, launch, android.app.PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 23) android.app.PendingIntent.FLAG_IMMUTABLE else 0))
        val b = if (Build.VERSION.SDK_INT >= 26) android.app.Notification.Builder(ctx, "jarvis_alert") else android.app.Notification.Builder(ctx)
        b.setSmallIcon(ctx.applicationInfo.icon).setContentTitle(title).setContentText(text)
          .setStyle(android.app.Notification.BigTextStyle().bigText(text)).setAutoCancel(true).setContentIntent(pi)
          .setCategory(android.app.Notification.CATEGORY_CALL).setFullScreenIntent(pi, true)
        if (Build.VERSION.SDK_INT < 26) { b.setSound(uri); b.setPriority(android.app.Notification.PRIORITY_MAX) }
        nm.notify(7001, b.build())
        true
      } catch (e: Exception) { false }
    }
    Function("lastCallType") { number: String ->
      try {
        val ctx = appContext.reactContext ?: return@Function -1
        val c = ctx.contentResolver.query(android.provider.CallLog.Calls.CONTENT_URI,
          arrayOf(android.provider.CallLog.Calls.NUMBER, android.provider.CallLog.Calls.TYPE),
          null, null, android.provider.CallLog.Calls.DATE + " DESC LIMIT 1")
        var t = -1
        c?.use { if (it.moveToFirst()) { val n = it.getString(0) ?: ""; if (n.takeLast(10) == number.takeLast(10)) t = it.getInt(1) } }
        t
      } catch (e: Exception) { -1 }
    }
    Function("muteBeep") { muted: Boolean ->
      try {
        val am = ctx.getSystemService(Context.AUDIO_SERVICE) as android.media.AudioManager
        am.adjustStreamVolume(android.media.AudioManager.STREAM_MUSIC, if (muted) android.media.AudioManager.ADJUST_MUTE else android.media.AudioManager.ADJUST_UNMUTE, 0)
        true
      } catch (e: Exception) { false }
    }

    OnCreate {
      JarvisBus.callListener = { state, number -> sendEvent("onCall", mapOf("state" to state, "number" to number)) }
      JarvisBus.listener = { app, title, text -> sendEvent("onNotification", mapOf("app" to app, "title" to title, "text" to text)) }
    }

    OnDestroy { JarvisBus.listener = null; JarvisBus.callListener = null }

    Function("notificationAccessEnabled") {
      val s = Settings.Secure.getString(ctx.contentResolver, "enabled_notification_listeners") ?: ""
      s.contains(ctx.packageName)
    }

    Function("openNotificationSettings") {
      val i = Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      ctx.startActivity(i)
      true
    }

    Function("startCall") { number: String ->
      if (!has(Manifest.permission.CALL_PHONE)) return@Function "permission"
      try {
        val i = Intent(Intent.ACTION_CALL, android.net.Uri.parse("tel:" + android.net.Uri.encode(number)))
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        ctx.startActivity(i)
        "ok"
      } catch (e: Exception) { "failed" }
    }

    Function("startListenService") {
      val i = Intent(ctx, ListenService::class.java)
      if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
      true
    }

    Function("stopListenService") {
      ctx.stopService(Intent(ctx, ListenService::class.java))
      true
    }

    Function("answerCall") {
      if (!has(Manifest.permission.ANSWER_PHONE_CALLS)) return@Function "permission"
      val tm = ctx.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
      try { tm.acceptRingingCall(); "ok" } catch (e: Exception) { "failed" }
    }

    Function("endCall") {
      if (!has(Manifest.permission.ANSWER_PHONE_CALLS)) return@Function "permission"
      val tm = ctx.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
      try { if (Build.VERSION.SDK_INT >= 28 && tm.endCall()) "ok" else "failed" } catch (e: Exception) { "failed" }
    }

    Function("sendSms") { number: String, text: String ->
      if (!has(Manifest.permission.SEND_SMS)) return@Function "permission"
      try {
        val sm: SmsManager = if (Build.VERSION.SDK_INT >= 31) ctx.getSystemService(SmsManager::class.java) else @Suppress("DEPRECATION") SmsManager.getDefault()
        sm.sendMultipartTextMessage(number, null, sm.divideMessage(text), null, null)
        "ok"
      } catch (e: Exception) { "failed" }
    }

    Function("accessibilityEnabled") { JarvisAccessibilityService.instance != null }

    Function("openAccessibilitySettings") {
      val i = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      ctx.startActivity(i)
      true
    }

    Function("phoneAction") { kind: String, arg: String ->
      val svc = JarvisAccessibilityService.instance ?: return@Function "not-enabled"
      svc.run(kind, arg)
    }
  }
}
