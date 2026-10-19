package com.njsstore.livestudio.bridge

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothClass
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.provider.Settings
import android.view.KeyEvent
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.njsstore.livestudio.studio.Events
import com.njsstore.livestudio.studio.Threads
import org.json.JSONArray

/** Dispatches Bluetooth / HID remote key presses (clickers, gamepads, headset buttons) to JS. */
object RemoteKeys {
    @Volatile var capture = false
    @Volatile var bindings: Set<Int> = emptySet()

    private val system = setOf(
        KeyEvent.KEYCODE_BACK, KeyEvent.KEYCODE_HOME, KeyEvent.KEYCODE_APP_SWITCH, KeyEvent.KEYCODE_POWER,
        KeyEvent.KEYCODE_MENU, KeyEvent.KEYCODE_SLEEP, KeyEvent.KEYCODE_WAKEUP, KeyEvent.KEYCODE_ASSIST,
    )
    /** @return true when the key was consumed so Android does not also act on it. */
    fun handle(event: KeyEvent): Boolean {
        val code = event.keyCode
        if (code in system) return false
        if (!capture && code !in bindings) return false
        Events.emit("studio.remoteKey") {
            putInt("keyCode", code)
            putString("key", KeyEvent.keyCodeToString(code).removePrefix("KEYCODE_"))
            putString("action", if (event.action == KeyEvent.ACTION_UP) "up" else "down")
            putInt("repeat", event.repeatCount)
            putBoolean("learning", capture)
        }
        return true
    }
}

class BluetoothModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName() = NAME

    private val manager get() = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    private val adapter: BluetoothAdapter? get() = manager?.adapter
    private val audio get() = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val found = LinkedHashMap<String, Found>()
    private var scanReceiver: BroadcastReceiver? = null
    private var aclReceiver: BroadcastReceiver? = null
    private var audioCallback: AudioDeviceCallback? = null

    private class Found(val address: String, val name: String, val kind: String, val bonded: Boolean, val rssi: Int?) {
        fun toMap(): WritableMap = Arguments.createMap().apply {
            putString("address", address)
            putString("name", name)
            putString("kind", kind)
            putBoolean("bonded", bonded)
            putBoolean("connected", false)
            rssi?.let { putInt("rssi", it) }
        }
    }

    override fun initialize() {
        super.initialize()
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(c: Context, intent: Intent) {
                val device = deviceOf(intent) ?: return
                Events.emit("studio.bluetooth") {
                    putString("type", "acl")
                    putString("address", device.address)
                    putBoolean("connected", intent.action == BluetoothDevice.ACTION_ACL_CONNECTED)
                }
            }
        }
        aclReceiver = receiver
        ContextCompat.registerReceiver(
            context, receiver,
            IntentFilter().apply { addAction(BluetoothDevice.ACTION_ACL_CONNECTED); addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED) },
            ContextCompat.RECEIVER_EXPORTED,
        )
        val callback = object : AudioDeviceCallback() {
            override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) = notifyAudio()
            override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) = notifyAudio()
            private fun notifyAudio() = Events.emit("studio.bluetooth") { putString("type", "audio") }
        }
        audioCallback = callback
        audio.registerAudioDeviceCallback(callback, Threads.main)
    }

    override fun invalidate() {
        stopScanInternal()
        aclReceiver?.let { runCatching { context.unregisterReceiver(it) } }
        aclReceiver = null
        audioCallback?.let { audio.unregisterAudioDeviceCallback(it) }
        audioCallback = null
        RemoteKeys.capture = false
        RemoteKeys.bindings = emptySet()
        super.invalidate()
    }

    private fun connectGranted() =
        Build.VERSION.SDK_INT < 31 || ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED

    private fun scanGranted() = if (Build.VERSION.SDK_INT >= 31) {
        ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED
    } else {
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    }

    @Suppress("DEPRECATION")
    private fun deviceOf(intent: Intent): BluetoothDevice? =
        if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
        else intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)

    @ReactMethod
    fun getState(promise: Promise) {
        val bluetooth = adapter
        promise.resolve(Arguments.createMap().apply {
            putBoolean("supported", bluetooth != null)
            putBoolean("enabled", runCatching { bluetooth?.isEnabled == true }.getOrDefault(false))
            putBoolean("connectGranted", connectGranted())
            putBoolean("scanGranted", scanGranted())
        })
    }

    @ReactMethod
    fun listAudioInputs(promise: Promise) {
        val array = Arguments.createArray()
        for (device in audio.getDevices(AudioManager.GET_DEVICES_INPUTS)) {
            array.pushMap(Arguments.createMap().apply {
                putInt("id", device.id)
                putString("type", typeName(device.type))
                putString("name", device.productName?.toString().orEmpty().ifBlank { typeName(device.type) })
                putString("address", if (Build.VERSION.SDK_INT >= 28) device.address else "")
                putBoolean("bluetooth", device.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO || (Build.VERSION.SDK_INT >= 31 && device.type == AudioDeviceInfo.TYPE_BLE_HEADSET))
            })
        }
        promise.resolve(array)
    }

    @ReactMethod
    fun listBondedDevices(promise: Promise) {
        if (!connectGranted()) {
            promise.reject("permission", "Allow Bluetooth access to list paired devices")
            return
        }
        val array = Arguments.createArray()
        try {
            adapter?.bondedDevices?.forEach { array.pushMap(describe(it, true, null).toMap()) }
            promise.resolve(array)
        } catch (e: SecurityException) {
            promise.reject("permission", "Allow Bluetooth access to list paired devices", e)
        }
    }

    @ReactMethod
    fun startScan(promise: Promise) {
        val bluetooth = adapter
        if (bluetooth == null) {
            promise.reject("bluetooth_off", "Turn Bluetooth on to scan")
            return
        }
        if (!scanGranted() || !connectGranted()) {
            promise.reject("permission", "Allow Bluetooth access to scan")
            return
        }
        try {
            if (!bluetooth.isEnabled) {
                promise.reject("bluetooth_off", "Turn Bluetooth on to scan")
                return
            }
        } catch (error: SecurityException) {
            promise.reject("permission", "Allow Bluetooth access to scan", error)
            return
        }
        stopScanInternal()
        found.clear()
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(c: Context, intent: Intent) {
                if (!connectGranted()) return
                val device = deviceOf(intent) ?: return
                val rssi = intent.getShortExtra(BluetoothDevice.EXTRA_RSSI, Short.MIN_VALUE).takeIf { it != Short.MIN_VALUE }?.toInt()
                val info = try {
                    describe(device, device.bondState == BluetoothDevice.BOND_BONDED, rssi)
                } catch (_: SecurityException) {
                    return
                }
                found[device.address] = info
                emitFound()
            }
        }
        scanReceiver = receiver
        ContextCompat.registerReceiver(context, receiver, IntentFilter(BluetoothDevice.ACTION_FOUND), ContextCompat.RECEIVER_EXPORTED)
        try {
            if (bluetooth.isDiscovering) bluetooth.cancelDiscovery()
            bluetooth.startDiscovery()
            promise.resolve(null)
        } catch (e: SecurityException) {
            promise.reject("permission", "Allow Bluetooth access to scan", e)
        }
    }

    @ReactMethod
    fun stopScan(promise: Promise) {
        stopScanInternal()
        promise.resolve(null)
    }

    private fun stopScanInternal() {
        scanReceiver?.let { runCatching { context.unregisterReceiver(it) } }
        scanReceiver = null
        try {
            if (scanGranted()) adapter?.cancelDiscovery()
        } catch (_: SecurityException) {
            Unit
        }
    }

    private fun emitFound() {
        val devices = Arguments.createArray()
        found.values.forEach { devices.pushMap(it.toMap()) }
        Events.emit("studio.bluetooth") { putString("type", "scan"); putArray("devices", devices) }
    }

    @ReactMethod
    fun readBattery(address: String, promise: Promise) {
        try {
            val device = adapter?.getRemoteDevice(address) ?: throw IllegalStateException("Bluetooth is not available")
            // Battery level is a hidden API on most Android versions; it is best-effort only.
            val level = BluetoothDevice::class.java.getMethod("getBatteryLevel").invoke(device) as? Int ?: -1
            if (level < 0) promise.reject("unsupported", "This device does not report its battery") else promise.resolve(level)
        } catch (e: Exception) {
            promise.reject("unsupported", "This device does not report its battery", e)
        }
    }

    @ReactMethod
    fun setRemoteKeyCapture(enabled: Boolean, promise: Promise) {
        RemoteKeys.capture = enabled
        promise.resolve(null)
    }

    @ReactMethod
    fun setRemoteKeyBindings(keysJson: String, promise: Promise) {
        try {
            val keys = JSONArray(keysJson)
            RemoteKeys.bindings = (0 until minOf(keys.length(), 64))
                .map { KeyEvent.keyCodeFromString("KEYCODE_" + keys.optString(it)) }
                .filter { it != KeyEvent.KEYCODE_UNKNOWN }
                .toSet()
            promise.resolve(null)
        } catch (error: Exception) {
            promise.reject("bindings", "Could not configure remote keys", error)
        }
    }

    @ReactMethod
    fun openBluetoothSettings(promise: Promise) {
        try {
            context.startActivity(Intent(Settings.ACTION_BLUETOOTH_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("system", e.message, e)
        }
    }

    private fun describe(device: BluetoothDevice, bonded: Boolean, rssi: Int?): Found {
        val major = try {
            device.bluetoothClass?.majorDeviceClass
        } catch (_: SecurityException) {
            null
        }
        val kind = when (major) {
            BluetoothClass.Device.Major.AUDIO_VIDEO -> "audio"
            BluetoothClass.Device.Major.PERIPHERAL -> "remote"
            BluetoothClass.Device.Major.PHONE -> "phone"
            BluetoothClass.Device.Major.WEARABLE -> "wearable"
            null -> "other"
            else -> "other"
        }
        val name = try {
            device.name
        } catch (_: SecurityException) {
            null
        }
        return Found(device.address, name.orEmpty().ifBlank { device.address }, kind, bonded, rssi)
    }

    private fun typeName(type: Int): String = when (type) {
        AudioDeviceInfo.TYPE_BUILTIN_MIC -> "Phone microphone"
        AudioDeviceInfo.TYPE_WIRED_HEADSET -> "Wired headset"
        AudioDeviceInfo.TYPE_USB_DEVICE, AudioDeviceInfo.TYPE_USB_HEADSET -> "USB microphone"
        AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> "Bluetooth headset"
        AudioDeviceInfo.TYPE_TELEPHONY -> "Telephony"
        else -> if (Build.VERSION.SDK_INT >= 31 && type == AudioDeviceInfo.TYPE_BLE_HEADSET) "Bluetooth LE headset" else "Audio input"
    }

    @ReactMethod fun addListener(eventName: String) = Unit

    @ReactMethod fun removeListeners(count: Int) = Unit

    companion object {
        const val NAME = "NjsStudioBluetooth"
    }
}
