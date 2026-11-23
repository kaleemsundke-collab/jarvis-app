package expo.modules.jarvisnative

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.graphics.Rect
import android.os.Bundle
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class JarvisAccessibilityService : AccessibilityService() {
  companion object {
    @Volatile var instance: JarvisAccessibilityService? = null
  }

  override fun onServiceConnected() { instance = this }
  override fun onUnbind(intent: android.content.Intent?): Boolean { instance = null; return super.onUnbind(intent) }
  override fun onDestroy() { instance = null; super.onDestroy() }
  override fun onAccessibilityEvent(event: AccessibilityEvent?) {}
  override fun onInterrupt() {}

  private fun findScrollable(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
    if (node == null) return null
    if (node.isScrollable) return node
    for (i in 0 until node.childCount) {
      val r = findScrollable(node.getChild(i))
      if (r != null) return r
    }
    return null
  }

  private fun tapAt(x: Float, y: Float): Boolean {
    val p = Path(); p.moveTo(x, y)
    val g = GestureDescription.Builder().addStroke(GestureDescription.StrokeDescription(p, 0, 60)).build()
    return dispatchGesture(g, null, null)
  }

  fun run(kind: String, arg: String): String {
    when (kind) {
      "back" -> return if (performGlobalAction(GLOBAL_ACTION_BACK)) "ok" else "failed"
      "home" -> return if (performGlobalAction(GLOBAL_ACTION_HOME)) "ok" else "failed"
      "recents" -> return if (performGlobalAction(GLOBAL_ACTION_RECENTS)) "ok" else "failed"
      "notifications" -> return if (performGlobalAction(GLOBAL_ACTION_NOTIFICATIONS)) "ok" else "failed"
      "scroll_down", "scroll_up" -> {
        val s = findScrollable(rootInActiveWindow) ?: return "nothing-to-scroll"
        val a = if (kind == "scroll_down") AccessibilityNodeInfo.ACTION_SCROLL_FORWARD else AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
        return if (s.performAction(a)) "ok" else "failed"
      }
      "tap_text" -> {
        val root = rootInActiveWindow ?: return "no-window"
        val hits = root.findAccessibilityNodeInfosByText(arg)
        if (hits.isNullOrEmpty()) return "not-found"
        var n: AccessibilityNodeInfo? = hits[0]
        while (n != null && !n.isClickable) n = n.parent
        if (n != null && n.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return "ok"
        val r = Rect(); hits[0].getBoundsInScreen(r)
        return if (tapAt(r.exactCenterX(), r.exactCenterY())) "ok" else "failed"
      }
      "type" -> {
        val f = rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT) ?: return "no-field"
        val b = Bundle()
        b.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, arg)
        return if (f.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, b)) "ok" else "failed"
      }
    }
    return "unknown"
  }
}
