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
