package expo.modules.jarvisnative

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.TelephonyManager

class JarvisCallReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    try {
      if (intent.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return
      val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE) ?: return
      val number = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER) ?: ""
      JarvisBus.call(state, number)
    } catch (e: Exception) { /* ignore */ }
  }
}
