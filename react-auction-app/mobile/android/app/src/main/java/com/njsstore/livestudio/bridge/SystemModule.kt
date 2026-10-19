package com.njsstore.livestudio.bridge

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.os.StatFs
import android.provider.Settings
import android.view.WindowManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.njsstore.livestudio.studio.Events
import com.njsstore.livestudio.studio.StudioService
import com.njsstore.livestudio.studio.Threads

/** Device facts the pre-flight and health reporting need, plus small OS helpers. */
class SystemModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName() = NAME

    private val power get() = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    private var thermalListener: PowerManager.OnThermalStatusChangedListener? = null

    override fun initialize() {
        super.initialize()
        if (Build.VERSION.SDK_INT >= 29) {
            val listener = PowerManager.OnThermalStatusChangedListener { status -> Events.emit("studio.thermal") { putInt("status", status) } }
            thermalListener = listener
            power.addThermalStatusListener(listener)
        }
    }

    override fun invalidate() {
        if (Build.VERSION.SDK_INT >= 29) thermalListener?.let { power.removeThermalStatusListener(it) }
        thermalListener = null
        super.invalidate()
    }

    @ReactMethod
    fun getAppInfo(promise: Promise) {
        try {
            val info = context.packageManager.getPackageInfo(context.packageName, 0)
            promise.resolve(Arguments.createMap().apply {
                putString("versionName", info.versionName ?: "")
                putDouble("versionCode", (if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()).toDouble())
                putString("packageName", context.packageName)
                putInt("sdk", Build.VERSION.SDK_INT)
                putString("model", "${Build.MANUFACTURER} ${Build.MODEL}")
            })
        } catch (e: Exception) {
            promise.reject("system", e.message, e)
        }
    }

    @ReactMethod
    fun getBattery(promise: Promise) {
        val intent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = intent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = intent?.getIntExtra(BatteryManager.EXTRA_SCALE, 100) ?: 100
        val status = intent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val temperature = intent?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0) ?: 0
        promise.resolve(Arguments.createMap().apply {
            putDouble("level", if (level >= 0 && scale > 0) level * 100.0 / scale else 100.0)
            putBoolean("charging", status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL)
            putDouble("temperatureC", temperature / 10.0)
        })
    }

    @ReactMethod
    fun getThermalStatus(promise: Promise) {
        promise.resolve(if (Build.VERSION.SDK_INT >= 29) power.currentThermalStatus else 0)
    }

    @ReactMethod
    fun getFreeStorageMb(promise: Promise) {
        try {
            val dir = context.getExternalFilesDir(null) ?: context.filesDir
            promise.resolve(StatFs(dir.path).availableBytes / (1024.0 * 1024.0))
        } catch (e: Exception) {
            promise.reject("system", e.message, e)
        }
    }

    @ReactMethod
    fun setKeepScreenOn(enabled: Boolean, promise: Promise) {
        val activity = context.currentActivity
        if (activity == null) {
            promise.resolve(null)
            return
        }
        Threads.main.post {
            if (enabled) activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
        promise.resolve(null)
    }

    @ReactMethod
    fun copyText(text: String, promise: Promise) {
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("NJS Live Studio", text))
        promise.resolve(null)
    }

    @ReactMethod
    fun openAppSettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("system", e.message, e)
        }
    }

    @ReactMethod
    fun startService(title: String, text: String, promise: Promise) {
        promise.resolve(StudioService.start(context, title, text))
    }

    @ReactMethod
    fun stopService(promise: Promise) {
        StudioService.stop(context)
        promise.resolve(null)
    }

    @ReactMethod fun addListener(eventName: String) = Unit

    @ReactMethod fun removeListeners(count: Int) = Unit

    companion object {
        const val NAME = "NjsStudioSystem"
    }
}
