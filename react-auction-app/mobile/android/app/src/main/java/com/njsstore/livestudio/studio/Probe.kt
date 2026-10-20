package com.njsstore.livestudio.studio

import android.content.Context
import android.graphics.SurfaceTexture
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject

/** Reads what the phone can really do so the app never offers a quality the hardware cannot deliver. */
object Probe {
    private val COMBOS = listOf(
        1280 to 720 to 30, 1280 to 720 to 60,
        1920 to 1080 to 30, 1920 to 1080 to 60,
        2560 to 1440 to 30, 2560 to 1440 to 60,
        3840 to 2160 to 30, 3840 to 2160 to 60,
    )

    @Volatile private var cached: String? = null

    fun capabilities(context: Context): String = cached ?: build(context).toString().also { cached = it }

    private fun build(context: Context): JSONObject = JSONObject().apply {
        put("device", JSONObject().apply {
            put("model", Build.MODEL)
            put("manufacturer", Build.MANUFACTURER)
            put("sdk", Build.VERSION.SDK_INT)
            put("abis", JSONArray(Build.SUPPORTED_ABIS.toList()))
        })
        put("cameras", cameras(context))
        put("encoders", JSONObject().apply {
            put("h264", encoder("video/avc") ?: JSONObject.NULL)
            put("h265", encoder("video/hevc") ?: JSONObject.NULL)
        })
    }

    private fun cameras(context: Context): JSONArray {
        val manager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        val result = JSONArray()
        val ids = try { manager.cameraIdList } catch (_: Exception) { return result }
        for (id in ids) {
            try {
                val c = manager.getCameraCharacteristics(id)
                val capabilities = c.get(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES)?.toList().orEmpty()
                // Depth / IR-only cameras cannot produce colour video.
                if (!capabilities.contains(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES_BACKWARD_COMPATIBLE)) continue
                val facing = when (c.get(CameraCharacteristics.LENS_FACING)) {
                    CameraCharacteristics.LENS_FACING_BACK -> "back"
                    CameraCharacteristics.LENS_FACING_FRONT -> "front"
                    else -> "external"
                }
                val map = c.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP) ?: continue
                val aeFps = c.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES)?.maxOfOrNull { it.upper } ?: 30
                val sizes = JSONArray()
                for (size in map.getOutputSizes(SurfaceTexture::class.java).orEmpty().sortedByDescending { it.width * it.height }) {
                    if (size.width < 640) continue
                    val minDuration = map.getOutputMinFrameDuration(SurfaceTexture::class.java, size)
                    val sensorFps = if (minDuration > 0) (1_000_000_000L / minDuration).toInt() else 30
                    sizes.put(JSONObject().apply {
                        put("w", size.width); put("h", size.height); put("maxFps", minOf(sensorFps, aeFps).coerceAtLeast(15))
                    })
                }
                val stabilization = JSONArray().apply {
                    val eis = c.get(CameraCharacteristics.CONTROL_AVAILABLE_VIDEO_STABILIZATION_MODES)?.any { it != 0 } == true
                    val ois = c.get(CameraCharacteristics.LENS_INFO_AVAILABLE_OPTICAL_STABILIZATION)?.any { it != 0 } == true
                    if (eis) put("video")
                    if (ois) put("optical")
                }
                val physical = JSONArray().apply { if (Build.VERSION.SDK_INT >= 28) c.physicalCameraIds.forEach { put(it) } }
                result.put(JSONObject().apply {
                    put("id", id)
                    put("facing", facing)
                    put("zoomMax", zoomMax(c))
                    put("hasFlash", c.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true)
                    put("logicalMulti", Build.VERSION.SDK_INT >= 28 && capabilities.contains(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES_LOGICAL_MULTI_CAMERA))
                    put("physicalIds", physical)
                    put("stabilization", stabilization)
                    put("sizes", sizes)
                    put("raw", capabilities.contains(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES_RAW) && map.getOutputSizes(android.graphics.ImageFormat.RAW_SENSOR)?.isNotEmpty() == true)
                    put("manualSensor", capabilities.contains(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES_MANUAL_SENSOR))
                    c.get(CameraCharacteristics.SENSOR_INFO_SENSITIVITY_RANGE)?.let { range -> put("iso", JSONObject().put("min", range.lower).put("max", range.upper)) }
                    c.get(CameraCharacteristics.SENSOR_INFO_EXPOSURE_TIME_RANGE)?.let { range -> put("exposureNs", JSONObject().put("min", range.lower).put("max", range.upper)) }
                    put("focusDiopters", (c.get(CameraCharacteristics.LENS_INFO_MINIMUM_FOCUS_DISTANCE) ?: 0f).toDouble())
                    put("whiteBalanceModes", JSONArray(c.get(CameraCharacteristics.CONTROL_AWB_AVAILABLE_MODES)?.toList().orEmpty()))
                })
            } catch (_: Exception) {
                // A camera that cannot be queried (in use, restricted) is simply not offered.
            }
        }
        return result
    }

    private fun zoomMax(c: CameraCharacteristics): Double {
        if (Build.VERSION.SDK_INT >= 30) c.get(CameraCharacteristics.CONTROL_ZOOM_RATIO_RANGE)?.let { return it.upper.toDouble() }
        return (c.get(CameraCharacteristics.SCALER_AVAILABLE_MAX_DIGITAL_ZOOM) ?: 1f).toDouble()
    }

    private fun encoder(mime: String): JSONObject? {
        val infos = MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos.filter { info ->
            info.isEncoder && info.supportedTypes.any { it.equals(mime, true) }
        }
        val best = infos.firstOrNull { hardware(it) } ?: infos.firstOrNull() ?: return null
        val caps = best.getCapabilitiesForType(mime)
        val video = caps.videoCapabilities ?: return null
        if (caps.colorFormats.none { it == MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface }) return null
        val supported = JSONArray()
        for ((size, fps) in COMBOS) {
            val (w, h) = size
            if (video.isSizeSupported(w, h) && video.areSizeAndRateSupported(w, h, fps.toDouble())) supported.put("${w}x$h@$fps")
        }
        return JSONObject().apply {
            put("name", best.name)
            put("hardware", hardware(best))
            put("maxWidth", video.supportedWidths.upper)
            put("maxHeight", video.supportedHeights.upper)
            put("maxBitrate", video.bitrateRange.upper)
            put("supported", supported)
        }
    }

    private fun hardware(info: MediaCodecInfo): Boolean =
        if (Build.VERSION.SDK_INT >= 29) info.isHardwareAccelerated
        else !info.name.startsWith("OMX.google.", true) && !info.name.startsWith("c2.android.", true)
}
