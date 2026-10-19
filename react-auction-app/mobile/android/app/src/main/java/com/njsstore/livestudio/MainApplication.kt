package com.njsstore.livestudio

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.njsstore.livestudio.bridge.StudioPackage
import com.njsstore.livestudio.studio.Engine

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(StudioPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    Engine.init(this)
    loadReactNative(this)
  }
}
