package com.njsstore.livestudio.bridge

import android.content.ClipData
import android.app.Activity
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.os.StatFs
import android.graphics.Rect
import android.print.PrintManager
import android.util.Base64
import android.view.View
import android.view.ViewGroup
import android.provider.Settings
import android.view.WindowManager
import android.webkit.WebView
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.njsstore.livestudio.studio.Events
import com.njsstore.livestudio.studio.StudioService
import com.njsstore.livestudio.studio.Threads
import java.security.MessageDigest
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.util.UUID
import java.util.concurrent.Executors

/** Device facts the pre-flight and health reporting need, plus small OS helpers. */
class SystemModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName() = NAME

    private val power get() = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    private var thermalListener: PowerManager.OnThermalStatusChangedListener? = null
    private val documents = Executors.newSingleThreadExecutor()
    private var documentPromise: Promise? = null
    private var documentBytes: ByteArray? = null
    private val documentRequest = 8307
    private val documentListener = object : BaseActivityEventListener() {
        override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
            if (requestCode != documentRequest) return
            val pending = documentPromise ?: return
            val bytes = documentBytes
            documentPromise = null
            documentBytes = null
            val uri = data?.data
            if (resultCode != Activity.RESULT_OK || uri == null || bytes == null) {
                pending.resolve(false)
                return
            }
            documents.execute {
                try {
                    context.contentResolver.openOutputStream(uri, "w").use { output ->
                        requireNotNull(output) { "Could not open the selected document" }
                        output.write(bytes)
                    }
                    pending.resolve(true)
                } catch (error: Exception) {
                    pending.reject("document", "Could not save the export", error)
                }
            }
        }
    }

    override fun initialize() {
        super.initialize()
        context.addActivityEventListener(documentListener)
        if (Build.VERSION.SDK_INT >= 29) {
            val listener = PowerManager.OnThermalStatusChangedListener { status -> Events.emit("studio.thermal") { putInt("status", status) } }
            thermalListener = listener
            power.addThermalStatusListener(listener)
        }
    }

    override fun invalidate() {
        context.removeActivityEventListener(documentListener)
        documentPromise?.reject("document", "The workspace was closed")
        documentPromise = null
        documentBytes = null
        documents.shutdown()
        if (Build.VERSION.SDK_INT >= 29) thermalListener?.let { power.removeThermalStatusListener(it) }
        thermalListener = null
        super.invalidate()
    }

    @ReactMethod
    fun getAppInfo(promise: Promise) {
        try {
            val flags = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else @Suppress("DEPRECATION") PackageManager.GET_SIGNATURES
            val info = context.packageManager.getPackageInfo(context.packageName, flags)
            val signatures = if (Build.VERSION.SDK_INT >= 28) info.signingInfo?.apkContentsSigners else @Suppress("DEPRECATION") info.signatures
            val signature = signatures?.singleOrNull() ?: throw IllegalStateException("Could not identify this app's signing certificate")
            val certificate = CertificateFactory.getInstance("X.509").generateCertificate(signature.toByteArray().inputStream()) as X509Certificate
            val fingerprint = MessageDigest.getInstance("SHA-256").digest(certificate.encoded).joinToString("") { value -> "%02x".format(value.toInt() and 255) }
            promise.resolve(Arguments.createMap().apply {
                putString("versionName", info.versionName ?: "")
                putDouble("versionCode", (if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()).toDouble())
                putString("packageName", context.packageName)
                putInt("sdk", Build.VERSION.SDK_INT)
                putString("model", "${Build.MANUFACTURER} ${Build.MODEL}")
                putString("signerSha256", fingerprint)
                putBoolean("developmentSigned", certificate.subjectX500Principal.name.contains("CN=Android Debug", ignoreCase = true))
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
    fun createWorkspaceToken(promise: Promise) = promise.resolve(UUID.randomUUID().toString())

    @ReactMethod
    fun saveWorkspaceDocument(name: String, dataUrl: String, promise: Promise) {
        try {
            require(dataUrl.length <= 11_186_000) { "The export is too large" }
            val divider = dataUrl.indexOf(',')
            require(divider in 1..256) { "Invalid export" }
            val header = dataUrl.substring(0, divider)
            require(header.startsWith("data:") && header.endsWith(";base64")) { "Invalid export encoding" }
            val mime = header.substringAfter("data:").substringBefore(';').ifBlank { "application/octet-stream" }
            require(mime.matches(Regex("[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+"))) { "Invalid export type" }
            val bytes = Base64.decode(dataUrl.substring(divider + 1), Base64.DEFAULT)
            require(bytes.size <= 8 * 1024 * 1024) { "The export is too large" }
            val filename = name.substringAfterLast('/').substringAfterLast('\\').replace(Regex("[\\x00-\\x1f]"), "_").take(96).ifBlank { "scoring-export" }
            Threads.main.post {
                val activity = context.currentActivity
                if (activity == null || documentPromise != null) {
                    promise.reject("document", "Close the current document picker and try again")
                } else {
                    documentPromise = promise
                    documentBytes = bytes
                    try {
                        activity.startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                            addCategory(Intent.CATEGORY_OPENABLE)
                            type = mime
                            putExtra(Intent.EXTRA_TITLE, filename)
                        }, documentRequest)
                    } catch (error: Exception) {
                        documentPromise = null
                        documentBytes = null
                        promise.reject("document", "Could not open the document picker", error)
                    }
                }
            }
        } catch (error: Exception) {
            promise.reject("document", error.message, error)
        }
    }

    @ReactMethod
    fun printWorkspace(promise: Promise) {
        Threads.main.post {
            try {
                val activity = context.currentActivity ?: throw IllegalStateException("Open the scoring workspace first")
                val web = visibleWebView(activity.window.decorView) ?: throw IllegalStateException("No scoring page is open")
                val manager = activity.getSystemService(Context.PRINT_SERVICE) as PrintManager
                manager.print("NJS Scorecard", web.createPrintDocumentAdapter("NJS Scorecard"), null)
                promise.resolve(null)
            } catch (error: Exception) {
                promise.reject("print", error.message, error)
            }
        }
    }

    private fun visibleWebView(view: View): WebView? {
        if (view is WebView && view.isShown && view.getGlobalVisibleRect(Rect())) return view
        if (view is ViewGroup) {
            for (index in 0 until view.childCount) visibleWebView(view.getChildAt(index))?.let { return it }
        }
        return null
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
