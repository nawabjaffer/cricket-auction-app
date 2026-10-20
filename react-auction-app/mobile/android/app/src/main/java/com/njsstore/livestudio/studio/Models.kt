package com.njsstore.livestudio.studio

import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/** Thrown for invalid input from JS; the message is shown to the operator. */
class StudioException(val code: String, message: String, cause: Throwable? = null) : Exception(message, cause)

data class VideoConfig(
    val width: Int, val height: Int, val fps: Int, val bitrateBps: Int, val minBitrateBps: Int,
    val codec: String, val iFrameInterval: Int, val rotation: Int, val stabilization: Boolean,
    val adaptive: Boolean, val facing: String,
) {
    val isPortrait get() = rotation == 90
    /** Size of the frames that are encoded and overlaid (rotation swaps the sides). */
    val frameWidth get() = if (isPortrait) height else width
    val frameHeight get() = if (isPortrait) width else height
}

data class AudioConfig(val sampleRate: Int, val stereo: Boolean, val bitrateBps: Int, val echoCanceler: Boolean, val noiseSuppressor: Boolean)

data class EngineConfig(val video: VideoConfig, val audio: AudioConfig, val overlayFps: Int, val overlayHardware: Boolean, val autoOrientation: Boolean)

data class DestinationSpec(val id: String, val protocol: String, val url: String)

data class OverlaySpec(
    val id: String, val kind: String, val url: String, val enabled: Boolean, val anchor: String,
    val widthPct: Float, val opacity: Float, val pageWidth: Int, val pageHeight: Int,
    val rotation: Int = 0, val scalePct: Float = 100f, val offsetXPct: Float = 0f, val offsetYPct: Float = 0f,
)

object Models {
    private val ID = Regex("^[A-Za-z0-9_-]{1,64}$")
    private val ANCHORS = setOf("full", "top-left", "top-center", "top-right", "center", "bottom-left", "bottom-center", "bottom-right")
    const val MAX_DESTINATIONS = 6
    const val MAX_OVERLAYS = 8

    private fun bad(message: String, cause: Throwable? = null): Nothing = throw StudioException("invalid_argument", message, cause)

    private fun parseObject(json: String, what: String): JSONObject =
        try { JSONObject(json) } catch (e: JSONException) { bad("$what is not valid JSON", e) }

    private fun parseArray(json: String, what: String): JSONArray =
        try { JSONArray(json) } catch (e: JSONException) { bad("$what is not valid JSON", e) }

    private fun JSONObject.int(name: String, min: Int, max: Int): Int {
        val value = optDouble(name, Double.NaN)
        if (value.isNaN() || value < min || value > max) bad("$name must be between $min and $max")
        return value.toInt()
    }

    fun parseConfig(json: String): EngineConfig {
        val root = parseObject(json, "Engine configuration")
        val video = root.optJSONObject("video") ?: bad("Missing video settings")
        val audio = root.optJSONObject("audio") ?: bad("Missing audio settings")
        val width = video.int("width", 320, 3840)
        val height = video.int("height", 240, 2160)
        if (width % 2 != 0 || height % 2 != 0) bad("Video size must be even")
        val codec = video.optString("codec", "h264")
        if (codec != "h264" && codec != "h265") bad("Unsupported video codec: $codec")
        val rotation = video.optInt("rotation", 0)
        if (rotation != 0 && rotation != 90) bad("rotation must be 0 or 90")
        val facing = video.optString("facing", "back")
        val fps = video.int("fps", 1, 120)
        val bitrate = video.int("bitrateBps", 200_000, 80_000_000)
        val sampleRate = audio.int("sampleRate", 8000, 96_000)
        return EngineConfig(
            video = VideoConfig(
                width = width, height = height, fps = fps, bitrateBps = bitrate,
                minBitrateBps = video.optInt("minBitrateBps", bitrate / 2).coerceIn(100_000, bitrate),
                codec = codec, iFrameInterval = video.optInt("iFrameInterval", 2).coerceIn(1, 10), rotation = rotation,
                stabilization = video.optBoolean("stabilization", true), adaptive = video.optBoolean("adaptive", true),
                facing = if (facing == "front") "front" else "back",
            ),
            audio = AudioConfig(
                sampleRate = sampleRate, stereo = audio.optBoolean("stereo", true),
                bitrateBps = audio.int("bitrateBps", 16_000, 512_000),
                echoCanceler = audio.optBoolean("echoCanceler", false), noiseSuppressor = audio.optBoolean("noiseSuppressor", false),
            ),
            overlayFps = root.optInt("overlayFps", 15).coerceIn(1, 30),
            overlayHardware = root.optBoolean("overlayHardware", false), autoOrientation = root.optBoolean("autoOrientation", false),
        )
    }

    fun parseDestinations(json: String): List<DestinationSpec> {
        val array = parseArray(json, "Destinations")
        if (array.length() == 0) bad("Add at least one destination")
        if (array.length() > MAX_DESTINATIONS) bad("At most $MAX_DESTINATIONS destinations can stream at once")
        val seen = HashSet<String>()
        return (0 until array.length()).map { index ->
            val item = array.optJSONObject(index) ?: bad("Destination ${index + 1} is malformed")
            val id = item.optString("id")
            if (!ID.matches(id) || !seen.add(id)) bad("Destination ${index + 1} has an invalid or duplicate id")
            val protocol = item.optString("protocol")
            val url = item.optString("url").trim()
            val valid = when (protocol) {
                "rtmp" -> url.startsWith("rtmp://", true) || url.startsWith("rtmps://", true)
                "srt" -> url.startsWith("srt://", true)
                else -> bad("Unsupported protocol: $protocol")
            }
            if (!valid) bad("The $protocol address for destination ${index + 1} is invalid")
            DestinationSpec(id, protocol, url)
        }
    }

    fun parseOverlays(json: String): List<OverlaySpec> {
        val array = parseArray(json, "Overlays")
        if (array.length() > MAX_OVERLAYS) bad("At most $MAX_OVERLAYS overlays are supported")
        val result = ArrayList<OverlaySpec>()
        for (index in 0 until array.length()) {
            val item = array.optJSONObject(index) ?: continue
            val id = item.optString("id")
            val url = item.optString("url").trim()
            // Only web content is ever loaded into the hidden WebView.
            if (!ID.matches(id) || !(url.startsWith("https://", true) || url.startsWith("http://", true))) continue
            val kind = if (item.optString("kind") == "image") "image" else "web"
            val anchor = item.optString("anchor", "full").let { if (it in ANCHORS) it else "full" }
            result += OverlaySpec(
                id = id, kind = kind, url = url, enabled = item.optBoolean("enabled", true), anchor = anchor,
                widthPct = item.optDouble("widthPct", 100.0).toFloat().coerceIn(5f, 100f),
                opacity = item.optDouble("opacity", 1.0).toFloat().coerceIn(0f, 1f),
                pageWidth = item.optInt("pageWidth", 1920).coerceIn(160, 3840),
                pageHeight = item.optInt("pageHeight", 1080).coerceIn(90, 2160),
                rotation = item.optInt("rotation", 0).let { if (it in setOf(0, 90, 180, 270)) it else 0 },
                scalePct = item.optDouble("scalePct", 100.0).toFloat().coerceIn(10f, 100f),
                offsetXPct = item.optDouble("offsetXPct", 0.0).toFloat().coerceIn(-50f, 50f),
                offsetYPct = item.optDouble("offsetYPct", 0.0).toFloat().coerceIn(-50f, 50f),
            )
        }
        return result
    }
}
