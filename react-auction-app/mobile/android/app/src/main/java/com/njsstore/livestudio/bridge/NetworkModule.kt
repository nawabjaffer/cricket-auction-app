package com.njsstore.livestudio.bridge

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.njsstore.livestudio.studio.Events
import com.njsstore.livestudio.studio.Net
import com.njsstore.livestudio.studio.toWritableMap
import org.json.JSONObject
import java.util.ArrayDeque
import java.util.concurrent.Executors
import com.njsstore.livestudio.studio.ConnectorControl

/** Connectivity snapshots plus mDNS (NSD) announcement and discovery of LAN cameras. */
class NetworkModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName() = NAME

    private val main = Handler(Looper.getMainLooper())
    private val connectivity get() = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    private val nsd get() = context.getSystemService(Context.NSD_SERVICE) as NsdManager

    private var callback: ConnectivityManager.NetworkCallback? = null
    private var emitSnapshot: Runnable? = null

    private var registration: NsdManager.RegistrationListener? = null
    private var registeredName: String? = null
    private var discovery: NsdManager.DiscoveryListener? = null
    private val resolveQueue = ArrayDeque<NsdServiceInfo>()
    private var resolving = false
    private var multicastLock: WifiManager.MulticastLock? = null
    private val cameraCommands = Executors.newSingleThreadExecutor()

    override fun invalidate() {
        ConnectorControl.stop()
        cameraCommands.shutdown()
        stopMonitorInternal()
        stopDiscoveryInternal()
        unregisterInternal()
        super.invalidate()
    }

    @ReactMethod
    fun startConnectorControl(port: Int, token: String, promise: Promise) {
        try { ConnectorControl.start(port, token); promise.resolve(null) }
        catch (error: Exception) { promise.reject("control", "Could not start camera controls", error) }
    }

    @ReactMethod
    fun stopConnectorControl(promise: Promise) {
        ConnectorControl.stop()
        promise.resolve(null)
    }

    @ReactMethod
    fun sendConnectorCommand(url: String, port: Int, token: String, action: String, value: Double, promise: Promise) {
        cameraCommands.execute {
            try { promise.resolve(ConnectorControl.send(url, port, token, action, value)) }
            catch (error: Exception) { promise.reject("control", error.message ?: "Camera did not respond. Check its connection and pair again.", error) }
        }
    }

    @ReactMethod
    fun getSnapshot(promise: Promise) {
        try {
            promise.resolve(Net.snapshot(context).toWritableMap())
        } catch (e: Exception) {
            promise.reject("network", e.message, e)
        }
    }

    // ── Connectivity monitor ─────────────────────────────────────────────────

    @ReactMethod
    fun startMonitor(promise: Promise) {
        stopMonitorInternal()
        val networkCallback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) = schedule()
            override fun onLost(network: Network) = schedule()
            override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) = schedule()
        }
        callback = networkCallback
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                connectivity.registerDefaultNetworkCallback(networkCallback, main)
            } else {
                connectivity.registerDefaultNetworkCallback(networkCallback)
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("network", e.message, e)
        }
    }

    @ReactMethod
    fun stopMonitor(promise: Promise) {
        stopMonitorInternal()
        promise.resolve(null)
    }

    private fun schedule() {
        emitSnapshot?.let { main.removeCallbacks(it) }
        val task = Runnable { Events.emit("studio.network", Net.snapshot(context).toWritableMap()) }
        emitSnapshot = task
        main.postDelayed(task, 400)
    }

    private fun stopMonitorInternal() {
        emitSnapshot?.let { main.removeCallbacks(it) }
        emitSnapshot = null
        callback?.let { runCatching { connectivity.unregisterNetworkCallback(it) } }
        callback = null
    }

    // ── Announce this phone as a camera ──────────────────────────────────────

    @ReactMethod
    fun registerService(name: String, port: Int, attrsJson: String, promise: Promise) {
        unregisterInternal()
        val info = NsdServiceInfo().apply {
            serviceName = name.take(60).ifBlank { "Phone" }
            serviceType = SERVICE_TYPE
            this.port = port
            runCatching {
                val attrs = JSONObject(attrsJson)
                for (key in attrs.keys()) setAttribute(key.take(9), attrs.optString(key).take(100))
            }
        }
        val listener = object : NsdManager.RegistrationListener {
            override fun onServiceRegistered(serviceInfo: NsdServiceInfo) {
                registeredName = serviceInfo.serviceName
                promise.resolve(serviceInfo.serviceName)
            }
            override fun onRegistrationFailed(serviceInfo: NsdServiceInfo, errorCode: Int) = promise.reject("nsd", "Could not announce the camera on the network (code $errorCode)")
            override fun onServiceUnregistered(serviceInfo: NsdServiceInfo) = Unit
            override fun onUnregistrationFailed(serviceInfo: NsdServiceInfo, errorCode: Int) = Unit
        }
        registration = listener
        try {
            nsd.registerService(info, NsdManager.PROTOCOL_DNS_SD, listener)
        } catch (e: Exception) {
            promise.reject("nsd", e.message, e)
        }
    }

    @ReactMethod
    fun unregisterService(promise: Promise) {
        unregisterInternal()
        promise.resolve(null)
    }

    private fun unregisterInternal() {
        registration?.let { runCatching { nsd.unregisterService(it) } }
        registration = null
        registeredName = null
    }

    // ── Discover other cameras ───────────────────────────────────────────────

    @ReactMethod
    fun startDiscovery(promise: Promise) {
        stopDiscoveryInternal()
        val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
        multicastLock = wifi?.createMulticastLock("njs-studio")?.apply {
            setReferenceCounted(false)
            runCatching { acquire() }
        }
        val listener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(serviceType: String) = Unit
            override fun onDiscoveryStopped(serviceType: String) = Unit
            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) { Log.w(TAG, "discovery failed: $errorCode") }
            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) = Unit
            override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                if (serviceInfo.serviceName == registeredName) return
                synchronized(resolveQueue) { resolveQueue.add(serviceInfo) }
                resolveNext()
            }
            override fun onServiceLost(serviceInfo: NsdServiceInfo) {
                Events.emit("studio.lan") {
                    putString("type", "lost")
                    putMap("service", Arguments.createMap().apply {
                        putString("name", serviceInfo.serviceName)
                        putString("host", "")
                        putInt("port", 0)
                        putMap("attrs", Arguments.createMap())
                    })
                }
            }
        }
        discovery = listener
        try {
            nsd.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("nsd", e.message, e)
        }
    }

    @ReactMethod
    fun stopDiscovery(promise: Promise) {
        stopDiscoveryInternal()
        promise.resolve(null)
    }

    private fun stopDiscoveryInternal() {
        discovery?.let { runCatching { nsd.stopServiceDiscovery(it) } }
        discovery = null
        synchronized(resolveQueue) { resolveQueue.clear() }
        resolving = false
        multicastLock?.let { if (it.isHeld) runCatching { it.release() } }
        multicastLock = null
    }

    @Suppress("DEPRECATION")
    private fun resolveNext() {
        val next = synchronized(resolveQueue) {
            if (resolving) return
            resolveQueue.poll()?.also { resolving = true }
        } ?: return
        try {
            nsd.resolveService(next, object : NsdManager.ResolveListener {
                override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) = done()
                override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
                    val host = serviceInfo.host?.hostAddress
                    if (host != null) {
                        Events.emit("studio.lan") {
                            putString("type", "found")
                            putMap("service", Arguments.createMap().apply {
                                putString("name", serviceInfo.serviceName)
                                putString("host", host)
                                putInt("port", serviceInfo.port)
                                putMap("attrs", Arguments.createMap().apply {
                                    serviceInfo.attributes.forEach { (key, value) -> putString(key, String(value ?: ByteArray(0), Charsets.UTF_8)) }
                                })
                            })
                        }
                    }
                    done()
                }
            })
        } catch (e: Exception) {
            done()
        }
    }

    private fun done() {
        synchronized(resolveQueue) { resolving = false }
        resolveNext()
    }

    @ReactMethod fun addListener(eventName: String) = Unit

    @ReactMethod fun removeListeners(count: Int) = Unit

    companion object {
        const val NAME = "NjsStudioNetwork"
        private const val TAG = "NjsNetwork"
        private const val SERVICE_TYPE = "_njscam._tcp"
    }
}
