package com.njsstore.livestudio.studio

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.ImageFormat
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CaptureFailure
import android.hardware.camera2.CaptureRequest
import android.hardware.camera2.CaptureResult
import android.hardware.camera2.DngCreator
import android.hardware.camera2.TotalCaptureResult
import android.media.Image
import android.media.ImageReader
import android.os.Environment
import android.os.Handler
import org.json.JSONObject
import java.io.File

class RawStill(private val context: Context, private val handler: Handler) {
    @SuppressLint("MissingPermission")
    @Suppress("DEPRECATION")
    fun capture(id: String, controls: String, displayDegrees: Int, completed: (Result<File>) -> Unit) {
        val manager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        val camera = manager.getCameraCharacteristics(id)
        require(camera.get(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES)?.contains(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES_RAW) == true) { "RAW capture is not supported by this camera" }
        val sizes = camera.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)?.getOutputSizes(ImageFormat.RAW_SENSOR).orEmpty()
        val size = sizes.filter { it.width.toLong() * it.height <= 24_000_000 }.maxByOrNull { it.width.toLong() * it.height }
            ?: sizes.minByOrNull { it.width.toLong() * it.height } ?: throw IllegalStateException("No RAW sensor output is available")
        val reader = ImageReader.newInstance(size.width, size.height, ImageFormat.RAW_SENSOR, 3)
        var device: CameraDevice? = null
        var session: CameraCaptureSession? = null
        var image: Image? = null
        var metadata: TotalCaptureResult? = null
        val results = LinkedHashMap<Long, TotalCaptureResult>()
        var outcome: Result<File>? = null
        var delivered = false
        var availability: CameraManager.AvailabilityCallback? = null
        val timeout: Runnable

        fun deliver() {
            val result = outcome ?: return
            if (delivered) return
            delivered = true
            completed(result)
        }
        fun finish(result: Result<File>) {
            if (outcome != null) return
            outcome = result
            availability?.let { runCatching { manager.unregisterAvailabilityCallback(it) } }
            image?.close(); image = null
            runCatching { session?.stopRepeating() }
            runCatching { session?.close() }
            reader.close()
            val current = device
            if (current == null) deliver() else { current.close(); handler.postDelayed({ deliver() }, 1_500) }
        }
        fun writeIfReady() {
            val raw = image ?: return
            val result = metadata ?: return
            if (raw.timestamp != result.get(CaptureResult.SENSOR_TIMESTAMP)) return
            val exposure = result.get(CaptureResult.CONTROL_AE_STATE)
            if (JSONObject(controls).isNull("iso") && exposure != CaptureResult.CONTROL_AE_STATE_CONVERGED && exposure != CaptureResult.CONTROL_AE_STATE_LOCKED && exposure != CaptureResult.CONTROL_AE_STATE_FLASH_REQUIRED && result.frameNumber < 8) {
                raw.close(); image = null; metadata = null
                return
            }
            try {
                val folder = File(context.getExternalFilesDir(Environment.DIRECTORY_PICTURES), "NJSLiveStudio")
                require(folder.isDirectory || folder.mkdirs()) { "Could not create the RAW photo folder" }
                val file = File(folder, "RAW_${System.currentTimeMillis()}.dng")
                val staging = File(folder, ".${file.name}.pending")
                try {
                    DngCreator(camera, result).use { dng ->
                        val sensor = camera.get(CameraCharacteristics.SENSOR_ORIENTATION) ?: 0
                        val front = camera.get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_FRONT
                        val rotation = (sensor + (if (front) displayDegrees else -displayDegrees) + 360) % 360
                        dng.setOrientation(when (rotation) { 90 -> 6; 180 -> 3; 270 -> 8; else -> 1 })
                        staging.outputStream().use { dng.writeImage(it, raw) }
                    }
                    require(staging.renameTo(file)) { "Could not finalize the RAW photo" }
                    finish(Result.success(file))
                } finally { staging.delete() }
            } catch (error: Exception) { finish(Result.failure(error)) }
        }
        timeout = Runnable { finish(Result.failure(IllegalStateException("RAW capture timed out. The video preview will be restored."))) }
        handler.postDelayed(timeout, 20_000)
        reader.setOnImageAvailableListener({ source ->
            val latest = runCatching { source.acquireLatestImage() }.getOrNull() ?: return@setOnImageAvailableListener
            if (outcome != null) { latest.close(); return@setOnImageAvailableListener }
            image?.close(); image = latest
            metadata = results[latest.timestamp]
            writeIfReady()
        }, handler)
                fun open() {
                    try {
                        manager.openCamera(id, object : CameraDevice.StateCallback() {
                override fun onOpened(opened: CameraDevice) {
                    device = opened
                    if (outcome != null) { opened.close(); return }
                    try {
                        opened.createCaptureSession(listOf(reader.surface), object : CameraCaptureSession.StateCallback() {
                            override fun onConfigured(configured: CameraCaptureSession) {
                                if (outcome != null) { configured.close(); return }
                                session = configured
                                try {
                                    val request = opened.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE).apply {
                                        addTarget(reader.surface)
                                        CameraPro.apply(this, JSONObject(controls), camera)
                                    }.build()
                                    configured.setRepeatingRequest(request, object : CameraCaptureSession.CaptureCallback() {
                                        override fun onCaptureCompleted(current: CameraCaptureSession, request: CaptureRequest, result: TotalCaptureResult) {
                                            if (outcome != null) return
                                            result.get(CaptureResult.SENSOR_TIMESTAMP)?.let { timestamp -> results[timestamp] = result }
                                            while (results.size > 8) results.remove(results.keys.first())
                                            metadata = image?.timestamp?.let { results[it] }
                                            writeIfReady()
                                        }
                                        override fun onCaptureFailed(current: CameraCaptureSession, request: CaptureRequest, failure: CaptureFailure) = finish(Result.failure(IllegalStateException("RAW sensor capture failed (${failure.reason})")))
                                    }, handler)
                                } catch (error: Exception) { finish(Result.failure(error)) }
                            }
                            override fun onConfigureFailed(current: CameraCaptureSession) = finish(Result.failure(IllegalStateException("This camera cannot open a RAW capture session")))
                        }, handler)
                    } catch (error: Exception) { finish(Result.failure(error)) }
                }
                override fun onDisconnected(current: CameraDevice) { if (outcome != null) { current.close(); return }; device = current; finish(Result.failure(IllegalStateException("Camera disconnected during RAW capture"))) }
                override fun onError(current: CameraDevice, error: Int) { if (outcome != null) { current.close(); return }; device = current; finish(Result.failure(IllegalStateException("RAW camera error ($error)"))) }
                override fun onClosed(current: CameraDevice) { handler.removeCallbacks(timeout); deliver() }
            }, handler)
          } catch (error: Exception) { handler.removeCallbacks(timeout); finish(Result.failure(error)) }
        }
        availability = object : CameraManager.AvailabilityCallback() {
            private var opening = false
            override fun onCameraAvailable(cameraId: String) {
                if (cameraId != id || opening || outcome != null) return
                opening = true
                manager.unregisterAvailabilityCallback(this)
                open()
            }
        }
        try { manager.registerAvailabilityCallback(availability!!, handler) }
        catch (error: Exception) { handler.removeCallbacks(timeout); finish(Result.failure(error)) }
    }
}