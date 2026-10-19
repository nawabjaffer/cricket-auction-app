package com.njsstore.livestudio.bridge

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager
import com.njsstore.livestudio.studio.Engine
import com.njsstore.livestudio.studio.StudioException

/** Rejects with a stable error code for [StudioException] and the plain message otherwise. */
fun Promise.fail(error: Throwable) {
    when (error) {
        is StudioException -> reject(error.code, error.message, error)
        else -> reject("engine_error", error.message ?: error.javaClass.simpleName, error)
    }
}

/** Runs [block] on the engine thread and resolves with its result. */
fun Promise.runValue(block: () -> Any?) = Engine.submit(onError = { fail(it) }) { resolve(block()) }

fun Promise.runVoid(block: () -> Unit) = Engine.submit(onError = { fail(it) }) {
    block()
    resolve(null)
}

class StudioPackage : BaseReactPackage() {
    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? = when (name) {
        EngineModule.NAME -> EngineModule(reactContext)
        BluetoothModule.NAME -> BluetoothModule(reactContext)
        NetworkModule.NAME -> NetworkModule(reactContext)
        SystemModule.NAME -> SystemModule(reactContext)
        SecureModule.NAME -> SecureModule(reactContext)
        AuthModule.NAME -> AuthModule(reactContext)
        ScannerModule.NAME -> ScannerModule(reactContext)
        else -> null
    }

    override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
        listOf(
            EngineModule.NAME, BluetoothModule.NAME, NetworkModule.NAME, SystemModule.NAME,
            SecureModule.NAME, AuthModule.NAME, ScannerModule.NAME,
        ).associateWith { name ->
            ReactModuleInfo(name, name, false, false, false, false)
        }
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
        listOf(StudioPreviewManager(), PeerPreviewManager())
}
