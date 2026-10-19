package com.njsstore.livestudio.bridge

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.njsstore.livestudio.studio.Engine
import com.njsstore.livestudio.studio.Events

/** JS surface of the encoder engine; every method is asynchronous and runs on the engine thread. */
class EngineModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName() = NAME

    override fun initialize() {
        super.initialize()
        Events.attach(context)
    }

    override fun invalidate() {
        Events.detach(context)
        Engine.submit { Engine.release() }
        super.invalidate()
    }

    @ReactMethod fun getCapabilities(promise: Promise) = promise.runValue { Engine.capabilities() }

    @ReactMethod fun prepare(configJson: String, mode: String, promise: Promise) = promise.runVoid { Engine.prepare(configJson, mode) }

    @ReactMethod fun release(promise: Promise) = promise.runVoid { Engine.release() }

    @ReactMethod fun startStream(destinationsJson: String, promise: Promise) = promise.runVoid { Engine.startStream(destinationsJson) }

    @ReactMethod fun stopStream(promise: Promise) = promise.runVoid { Engine.stopStream() }

    @ReactMethod fun startCameraServer(port: Int, promise: Promise) = promise.runValue { Engine.startCameraServer(port) }

    @ReactMethod fun stopCameraServer(promise: Promise) = promise.runVoid { Engine.stopCameraServer() }

    @ReactMethod fun startRecording(name: String, promise: Promise) = promise.runValue { Engine.startRecording(name) }

    @ReactMethod fun stopRecording(promise: Promise) = promise.runVoid { Engine.stopRecording() }

    @ReactMethod fun setVideoBitrate(bitrateBps: Int, promise: Promise) = promise.runVoid { Engine.setVideoBitrate(bitrateBps) }

    @ReactMethod fun requestKeyframe(promise: Promise) = promise.runVoid { Engine.requestKeyframe() }

    @ReactMethod fun switchCamera(promise: Promise) = promise.runVoid { Engine.switchCamera() }

    @ReactMethod fun selectCamera(id: String, promise: Promise) = promise.runVoid { Engine.selectCamera(id) }

    @ReactMethod fun setZoom(level: Double, promise: Promise) = promise.runVoid { Engine.setZoom(level.toFloat()) }

    @ReactMethod fun setTorch(enabled: Boolean, promise: Promise) = promise.runValue { Engine.setTorch(enabled) }

    @ReactMethod fun setExposure(level: Int, promise: Promise) = promise.runVoid { Engine.setExposure(level) }

    @ReactMethod fun setExposureLock(locked: Boolean, promise: Promise) = promise.runVoid { Engine.setExposureLock(locked) }

    @ReactMethod fun setAutoFocus(enabled: Boolean, promise: Promise) = promise.runVoid { Engine.setAutoFocus(enabled) }

    @ReactMethod fun setStabilization(enabled: Boolean, promise: Promise) = promise.runVoid { Engine.setStabilization(enabled) }

    @ReactMethod fun setMuted(muted: Boolean, promise: Promise) = promise.runVoid { Engine.setMuted(muted) }

    @ReactMethod fun setMicVolume(volume: Double, promise: Promise) = promise.runVoid { Engine.setMicVolume(volume.toFloat()) }

    @ReactMethod fun setAudioInput(deviceId: Int, promise: Promise) = promise.runValue { Engine.setAudioInput(deviceId) }

    @ReactMethod fun setOverlays(specsJson: String, promise: Promise) = promise.runVoid { Engine.setOverlays(specsJson) }

    @ReactMethod fun setOverlayOptions(fps: Int, hardware: Boolean, promise: Promise) = promise.runVoid { Engine.setOverlayOptions(fps, hardware) }

    @ReactMethod fun reloadOverlays(promise: Promise) = promise.runVoid { Engine.reloadOverlays() }

    @ReactMethod fun selectLocalSource(promise: Promise) = promise.runVoid { Engine.selectLocalSource() }

    @ReactMethod fun selectPeerSource(url: String, promise: Promise) = promise.runVoid { Engine.selectPeerSource(url) }

    @ReactMethod fun getZoomRange(promise: Promise) = promise.runValue {
        val (min, max) = Engine.zoomRange()
        Arguments.createMap().apply { putDouble("min", min); putDouble("max", max) }
    }

    @ReactMethod fun getExposureRange(promise: Promise) = promise.runValue {
        val (min, max, step) = Engine.exposureRange()
        Arguments.createMap().apply { putInt("min", min); putInt("max", max); putDouble("step", step) }
    }

    // Required by NativeEventEmitter; delivery itself goes through RCTDeviceEventEmitter.
    @ReactMethod fun addListener(eventName: String) = Unit

    @ReactMethod fun removeListeners(count: Int) = Unit

    companion object {
        const val NAME = "NjsStudioEngine"
    }
}
