package expo.modules.jarvisnative

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

object JarvisBus {
  val replies = java.util.concurrent.ConcurrentHashMap<String, Pair<String, Notification.Action>>()
  @Volatile var callListener: ((String, String) -> Unit)? = null
  fun call(state: String, number: String) { callListener?.invoke(state, number) }
  @Volatile var listener: ((String, String, String) -> Unit)? = null
  fun emit(app: String, title: String, text: String) { listener?.invoke(app, title, text) }
}

class JarvisNotificationService : NotificationListenerService() {
  override fun onNotificationPosted(sbn: StatusBarNotification) {
    try {
      if (sbn.isOngoing || sbn.packageName == packageName) return
      val n = sbn.notification
      if ((n.flags and Notification.FLAG_GROUP_SUMMARY) != 0) return
      val ex = n.extras
      val title = ex.getCharSequence("android.title")?.toString() ?: ""
      val text = ex.getCharSequence("android.text")?.toString() ?: ""
      if (title.isEmpty() && text.isEmpty()) return
      val label = try { packageManager.getApplicationLabel(packageManager.getApplicationInfo(sbn.packageName, 0)).toString() } catch (e: Exception) { sbn.packageName }
      try {
        if (title.isNotEmpty()) {
          val act = n.actions?.firstOrNull { it.remoteInputs != null && it.remoteInputs.isNotEmpty() }
          if (act != null) { JarvisBus.replies[title.lowercase().trim()] = Pair(label, act); if (JarvisBus.replies.size > 60) JarvisBus.replies.keys.firstOrNull()?.let { JarvisBus.replies.remove(it) } }
        }
      } catch (e: Exception) { /* ignore */ }
      JarvisBus.emit(label, title, text)
    } catch (e: Exception) { /* never crash the listener */ }
  }
}
