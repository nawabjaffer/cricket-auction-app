package com.njsstore.livestudio.studio

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONArray
import org.json.JSONObject

/** Bridge from native components to JS `onStudioEvent(...)` listeners. Events are dropped while JS is not running. */
object Events {
    @Volatile private var context: ReactApplicationContext? = null

    fun attach(reactContext: ReactApplicationContext) { context = reactContext }

    fun detach(reactContext: ReactApplicationContext) { if (context === reactContext) context = null }

    fun emit(name: String, payload: WritableMap = Arguments.createMap()) {
        val reactContext = context ?: return
        if (!reactContext.hasActiveReactInstance()) return
        try {
            reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(name, payload)
        } catch (_: RuntimeException) {
            // The React instance is being torn down; nothing is listening any more.
        }
    }

    fun emit(name: String, build: WritableMap.() -> Unit) = emit(name, Arguments.createMap().apply(build))
}

fun JSONObject.toWritableMap(): WritableMap {
    val map = Arguments.createMap()
    val keys = keys()
    while (keys.hasNext()) {
        val key = keys.next()
        when (val value = get(key)) {
            JSONObject.NULL -> map.putNull(key)
            is Boolean -> map.putBoolean(key, value)
            is Int -> map.putInt(key, value)
            is Long -> map.putDouble(key, value.toDouble())
            is Double -> map.putDouble(key, value)
            is String -> map.putString(key, value)
            is JSONObject -> map.putMap(key, value.toWritableMap())
            is JSONArray -> map.putArray(key, value.toWritableArray())
            else -> map.putString(key, value.toString())
        }
    }
    return map
}

fun JSONArray.toWritableArray(): WritableArray {
    val array = Arguments.createArray()
    for (index in 0 until length()) {
        when (val value = get(index)) {
            JSONObject.NULL -> array.pushNull()
            is Boolean -> array.pushBoolean(value)
            is Int -> array.pushInt(value)
            is Long -> array.pushDouble(value.toDouble())
            is Double -> array.pushDouble(value)
            is String -> array.pushString(value)
            is JSONObject -> array.pushMap(value.toWritableMap())
            is JSONArray -> array.pushArray(value.toWritableArray())
            else -> array.pushString(value.toString())
        }
    }
    return array
}
