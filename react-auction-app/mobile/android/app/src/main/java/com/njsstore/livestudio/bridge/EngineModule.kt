package com.njsstore.livestudio.bridge

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.njsstore.livestudio.studio.Engine
import com.njsstore.livestudio.studio.Events
import com.njsstore.livestudio.studio.GalleryMedia
import com.njsstore.livestudio.studio.OverlayAssets
import android.content.Intent
import android.net.Uri
import java.io.File
import java.util.concurrent.Executors

/** JS surface of the encoder engine; every method is asynchronous and runs on the engine thread. */
class EngineModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    private val mediaWriter = Executors.newSingleThreadExecutor()
    override fun getName() = NAME

    override fun initialize() {
        super.initialize()
        Events.attach(context)
    }

    override fun invalidate() {
        mediaWriter.shutdown()
        Events.detach(context)
        Engine.submit { Engine.release(force = true) }
        super.invalidate()
    }

    @ReactMethod fun getCapabilities(promise: Promise) = promise.runValue { Engine.capabilities() }

    @ReactMethod fun captureThumbnail(promise: Promise) = Engine.captureThumbnail { promise.resolve(it) }

    @ReactMethod fun setPreviewFill(fill: Boolean, promise: Promise) = promise.runVoid { Engine.setPreviewFill(fill) }

    @ReactMethod fun prepare(configJson: String, mode: String, promise: Promise) = promise.runVoid { Engine.prepare(configJson, mode) }

    @ReactMethod fun release(promise: Promise) = promise.runVoid { Engine.release() }

    @ReactMethod fun startStream(destinationsJson: String, promise: Promise) = promise.runVoid { Engine.startStream(destinationsJson) }

    @ReactMethod fun stopStream(promise: Promise) = promise.runVoid { Engine.stopStream() }

    @ReactMethod fun startCameraServer(port: Int, promise: Promise) = promise.runValue { Engine.startCameraServer(port) }

    @ReactMethod fun stopCameraServer(promise: Promise) = promise.runVoid { Engine.stopCameraServer() }

    @ReactMethod fun startRecording(name: String, promise: Promise) = promise.runValue { Engine.startRecording(name) }

    @ReactMethod fun stopRecording(promise: Promise) = promise.runVoid { Engine.stopRecording() }

    @ReactMethod fun pauseRecording(promise: Promise) = promise.runVoid { Engine.pauseRecording() }

    @ReactMethod fun resumeRecording(promise: Promise) = promise.runVoid { Engine.resumeRecording() }

    @ReactMethod fun finishCameraRecording(promise: Promise) = promise.runValue { Engine.finishCameraRecording() }

    @ReactMethod
    fun captureRawStill(promise: Promise) {
        Engine.submit(onError = { promise.reject("raw", it.message, it) }) {
            Engine.captureRawStill { result -> result.fold({ promise.resolve(it) }, { promise.reject("raw", it.message, it) }) }
        }
    }

    @ReactMethod
    fun syncOverlayAssets(url: String, promise: Promise) {
        mediaWriter.execute {
            try { promise.resolve(OverlayAssets.get(context).sync(url)) }
            catch (error: Exception) { promise.reject("overlay_assets", error.message, error) }
        }
    }

    @ReactMethod
    fun clearOverlayAssets(promise: Promise) {
        mediaWriter.execute {
            try { OverlayAssets.get(context).clear(); promise.resolve(null) }
            catch (error: Exception) { promise.reject("overlay_assets", error.message, error) }
        }
    }

    @ReactMethod
    fun saveRecordingToGallery(path: String, promise: Promise) {
        mediaWriter.execute {
            try {
                val file = File(path).canonicalFile
                val image = file.extension == "dng"
                val directory = File(context.getExternalFilesDir(if (image) android.os.Environment.DIRECTORY_PICTURES else android.os.Environment.DIRECTORY_MOVIES), "NJSLiveStudio").canonicalFile
                require(file.parentFile == directory && file.extension in listOf("mp4", "dng")) { "Invalid camera media file" }
                promise.resolve(GalleryMedia.publish(context, file, if (image) "image/x-adobe-dng" else "video/mp4", image))
                runCatching { file.delete() }
            } catch (error: Exception) { promise.reject("gallery", "Could not save to Gallery: ${error.message}. The private file is retained for retry.", error) }
        }
    }

    @ReactMethod
    fun openGalleryItem(uri: String, promise: Promise) {
        try {
            val target = Uri.parse(uri)
            require(target.scheme == "content" && target.authority == "media") { "Invalid Gallery item" }
            context.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(target, context.contentResolver.getType(target) ?: "video/mp4")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION))
            promise.resolve(null)
        } catch (error: Exception) { promise.reject("gallery", "No Gallery app could open this item", error) }
    }

    @ReactMethod
    fun getPendingCameraMedia(promise: Promise) {
        mediaWriter.execute {
            try {
                val files = listOf(android.os.Environment.DIRECTORY_MOVIES, android.os.Environment.DIRECTORY_PICTURES)
                    .flatMap { directory -> File(context.getExternalFilesDir(directory), "NJSLiveStudio").listFiles()?.toList().orEmpty() }
                    .filter { file -> file.isFile && ((file.name.startsWith("Camera_") && file.extension == "mp4") || (file.name.startsWith("RAW_") && file.extension == "dng")) }
                    .sortedByDescending { it.lastModified() }
                promise.resolve(Arguments.createArray().apply { files.forEach { pushString(it.absolutePath) } })
            } catch (error: Exception) { promise.reject("gallery", error.message, error) }
        }
    }

    @ReactMethod
    fun discardCameraMedia(path: String, promise: Promise) {
        mediaWriter.execute {
            try {
                val file = File(path).canonicalFile
                val image = file.extension == "dng"
                val folder = File(context.getExternalFilesDir(if (image) android.os.Environment.DIRECTORY_PICTURES else android.os.Environment.DIRECTORY_MOVIES), "NJSLiveStudio").canonicalFile
                require(file.parentFile == folder && ((image && file.name.startsWith("RAW_")) || (file.extension == "mp4" && file.name.startsWith("Camera_")))) { "Invalid camera media file" }
                require(!file.exists() || file.delete()) { "Could not remove the private file" }
                promise.resolve(null)
            } catch (error: Exception) { promise.reject("gallery", error.message, error) }
        }
    }

    @ReactMethod fun setVideoBitrate(bitrateBps: Int, promise: Promise) = promise.runVoid { Engine.setVideoBitrate(bitrateBps) }

    @ReactMethod fun requestKeyframe(promise: Promise) = promise.runVoid { Engine.requestKeyframe() }

    @ReactMethod fun switchCamera(promise: Promise) = promise.runVoid { Engine.switchCamera() }

    @ReactMethod fun selectCamera(id: String, promise: Promise) = promise.runVoid { Engine.selectCamera(id) }

    @ReactMethod fun setZoom(level: Double, promise: Promise) = promise.runVoid { Engine.setZoom(level.toFloat()) }

    @ReactMethod fun setTorch(enabled: Boolean, promise: Promise) = promise.runValue { Engine.setTorch(enabled) }

    @ReactMethod fun setExposure(level: Int, promise: Promise) = promise.runVoid { Engine.setExposure(level) }

    @ReactMethod fun setCameraProControls(json: String, promise: Promise) = promise.runVoid { Engine.setCameraProControls(json) }

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
