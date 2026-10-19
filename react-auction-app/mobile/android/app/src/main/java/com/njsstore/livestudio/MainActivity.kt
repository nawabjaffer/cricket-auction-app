package com.njsstore.livestudio

import android.os.Bundle
import android.view.KeyEvent
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.njsstore.livestudio.bridge.RemoteKeys
import com.njsstore.livestudio.studio.ActivityHolder

class MainActivity : ReactActivity() {
  /** Name of the component registered from JavaScript (index.js). */
  override fun getMainComponentName(): String = "NjsLiveStudio"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    ActivityHolder.activity = this
  }

  override fun onDestroy() {
    if (ActivityHolder.activity === this) ActivityHolder.activity = null
    super.onDestroy()
  }

  // Bluetooth clickers, gamepads and headset buttons arrive as key events.
  override fun dispatchKeyEvent(event: KeyEvent): Boolean = RemoteKeys.handle(event) || super.dispatchKeyEvent(event)
}
