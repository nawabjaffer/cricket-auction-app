package com.njsstore.livestudio.studio

import android.Manifest
import android.app.Application
import android.content.Context
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.hardware.display.DisplayManager
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.media.MediaCodec
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.util.Base64
import android.view.PixelCopy
import android.view.Surface
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.pedro.common.ConnectChecker
import com.pedro.common.VideoCodec
import com.pedro.encoder.CodecErrorCallback
import com.pedro.encoder.input.sources.OrientationForced
import com.pedro.encoder.input.sources.audio.MicrophoneSource
import com.pedro.encoder.input.sources.video.Camera2Source
import com.pedro.encoder.utils.CodecUtil
import com.pedro.encoder.utils.gl.AspectRatioMode
import com.pedro.library.base.recording.RecordController
import com.pedro.library.util.FpsListener
import java.io.File
import java.io.ByteArrayOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Single owner of the camera, microphone, encoders and destinations. Every mutation runs on the "studio-engine"
 * thread; the React Native module and the preview views only post work to it.
 */
object Engine {
    private const val TAG = "NjsEngine"
    private const val MAX_RETRIES = 30

    private lateinit var app: Application
    private lateinit var overlays: OverlayManager
    private val worker = HandlerThread("studio-engine").apply { start() }
    private val handler = Handler(worker.looper)

    private class DestinationInfo(var state: String, var reason: String? = null, var attempt: Int = 0)

    // ── State (engine thread only) ───────────────────────────────────────────
    private var stream: StudioStream? = null
    @Volatile private var cameraRef: Camera2Source? = null
    private var mic: MicrophoneSource? = null
    private var config: EngineConfig? = null
    private var configJson: String? = null
    private var mode = "none"
    private var state = "idle"
    private var message: String? = null
    private var previewSurface: Surface? = null
    private var previewWidth = 0
    private var previewHeight = 0
    private var previewFill = true
    private var overlayFps = 15
    private var overlayHardware = false
    private var overlaySpecs: List<OverlaySpec> = emptyList()
    private var abr: AdaptiveBitrate? = null
    private val destinations = LinkedHashMap<String, DestinationInfo>()
    private var everLive = false
    private var sessionStart = 0L
    private var lastFps = 0
    private var needsPrepare = false
    private var peerSource: PeerRtspVideoSource? = null
    private var recordingPath: String? = null
    private var recordingPaused = false
    private var proControls = "{}"
    @Volatile private var recordStatus: RecordController.Status? = null
    private var capturingRaw = false
    private var muted = false
    private var micVolume = 1f
    private var preferredAudioDevice: AudioDeviceInfo? = null
    private var statsTask: Runnable? = null
    private var serverBytes = 0L
    private var serverKbps = 0L
    private var displayListener: DisplayManager.DisplayListener? = null
    private var routedToBluetooth = false

    fun init(application: Application) {
        app = application
        overlays = OverlayManager(app) { ActivityHolder.activity }
    }

    // ── Threading ────────────────────────────────────────────────────────────

    /** Runs [block] on the engine thread; failures are reported through [onError] instead of crashing the app. */
    fun submit(onError: (Throwable) -> Unit = {}, block: () -> Unit) {
        handler.post {
            try {
                block()
            } catch (t: Throwable) {
                Log.w(TAG, "engine task failed", t)
                onError(t)
            }
        }
    }

    // ── Capabilities ─────────────────────────────────────────────────────────

    fun capabilities(): String = Probe.capabilities(app)

    // ── Prepare / release ────────────────────────────────────────────────────

    private fun hasSession() = destinations.isNotEmpty() || stream?.hasServer() == true

    fun prepare(json: String, requestedMode: String) {
        if (capturingRaw) throw StudioException("busy", "Wait for the RAW photo to finish")
        val cfg = Models.parseConfig(json)
        if (requestedMode != "studio" && requestedMode != "camera") throw StudioException("invalid_argument", "Unknown mode: $requestedMode")
        if (hasSession() || stream?.isRecording == true) throw StudioException("busy", "Stop the stream or recording before changing the video settings.")
        requirePermissions()
        teardown()
        proControls = "{}"
        setState("idle", "none", null)

        lockOrientation(cfg.video.rotation, cfg.autoOrientation)
        val camera = Camera2Source(app)
        if (cfg.video.facing == "front") camera.switchCamera()
        val microphone = MicrophoneSource()
        val created = StudioStream(app, camera, microphone, sinkListener)
        try {
            created.setVideoCodec(if (cfg.video.codec == "h265") VideoCodec.H265 else VideoCodec.H264)
            val video = cfg.video
            val videoReady = created.prepareVideo(
                width = video.width, height = video.height, bitrate = video.bitrateBps, fps = video.fps,
                iFrameInterval = video.iFrameInterval, rotation = video.rotation,
            )
            if (!videoReady) {
                throw StudioException("encoder", "This phone's video encoder cannot do ${video.width}x${video.height} at ${video.fps} fps${if (video.codec == "h265") " in H.265" else ""}. Choose a lower quality in Setup › Video.")
            }
            val audio = cfg.audio
            if (!created.prepareAudio(audio.sampleRate, audio.stereo, audio.bitrateBps, audio.echoCanceler, audio.noiseSuppressor)) {
                throw StudioException("audio", "The microphone could not be opened. Close other apps that record audio and try again.")
            }
        } catch (e: IllegalArgumentException) {
            runCatching { created.release() }
            unlockOrientation()
            throw StudioException("unsupported", e.message ?: "The selected quality is not supported by this phone", e)
        } catch (e: StudioException) {
            runCatching { created.release() }
            unlockOrientation()
            throw e
        }

        created.setFpsListener(FpsListener.Callback { fps -> lastFps = fps })
        created.setEncoderErrorCallback(codecErrors)
        if (muted) microphone.mute()
        microphone.microphoneVolume = micVolume
        preferredAudioDevice?.let { microphone.setPreferredDevice(it) }

        stream = created
        cameraRef = camera
        mic = microphone
        config = cfg
        configJson = json
        mode = requestedMode
        needsPrepare = false
        overlayFps = cfg.overlayFps
        overlayHardware = cfg.overlayHardware
        abr = AdaptiveBitrate(cfg.video.bitrateBps, cfg.video.minBitrateBps) { bps -> stream?.setVideoBitrateOnFly(bps) }
        Threads.onMain {
            overlays.configure(cfg.video.frameWidth, cfg.video.frameHeight, overlayFps, overlayHardware)
            overlays.setSpecs(overlaySpecs)
        }
        registerDisplayListener()
        setState("prepared", mode, null)
        startPreviewIfPossible()
        startStats()
    }

    private fun reprepare() {
        val json = configJson ?: throw StudioException("not_prepared", "The camera is not ready")
        val currentMode = mode
        prepare(json, currentMode)
    }

    fun release(force: Boolean = false) {
        if (!force && (stream?.isRecording == true || capturingRaw || hasSession())) throw StudioException("busy", "Stop recording or streaming before releasing the camera")
        teardown()
        setState("idle", "none", null)
    }

    private fun teardown() {
        stopStats()
        val current = stream
        if (current != null) {
            runCatching { current.abandon() }
            runCatching { if (current.isRecording) current.stopRecord() }
            runCatching { current.release() }
        }
        stream = null
        cameraRef = null
        mic = null
        peerSource = null
        config = null
        abr = null
        destinations.clear()
        everLive = false
        recordingPath = null
        recordingPaused = false
        recordStatus = null
        needsPrepare = false
        serverBytes = 0
        serverKbps = 0
        lastFps = 0
        releaseAudioRouting()
        runCatching {
            Threads.onMain {
                overlays.setSpecs(emptyList())
                unregisterDisplayListener()
            }
        }
        unlockOrientation()
        StudioService.stop(app)
    }

    private fun requirePermissions() {
        val missing = listOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO)
            .filter { ContextCompat.checkSelfPermission(app, it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isNotEmpty()) throw StudioException("permission", "Camera and microphone permissions are required.")
    }

    // ── Orientation: the screen follows the stream so the preview is upright ─

    @Suppress("DEPRECATION")
    private fun lockOrientation(rotation: Int, automatic: Boolean = false) {
        val activity = ActivityHolder.activity ?: return
        if (automatic) {
            Threads.onMain { activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR }
            return
        }
        val wanted = if (rotation == 90) ActivityInfo.SCREEN_ORIENTATION_PORTRAIT else ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        Threads.onMain { activity.requestedOrientation = wanted }
        val deadline = System.currentTimeMillis() + 1_500
        while (System.currentTimeMillis() < deadline) {
            val display = Threads.onMain { activity.windowManager.defaultDisplay.rotation }
            val portrait = display == Surface.ROTATION_0 || display == Surface.ROTATION_180
            if (portrait == (rotation == 90)) break
            Thread.sleep(50)
        }
    }

    private fun unlockOrientation() {
        val activity = ActivityHolder.activity ?: return
        runCatching { Threads.onMain { activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED } }
    }

    private fun registerDisplayListener() {
        unregisterDisplayListener()
        val manager = app.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
        val listener = object : DisplayManager.DisplayListener {
            override fun onDisplayAdded(displayId: Int) = Unit
            override fun onDisplayRemoved(displayId: Int) = Unit
            override fun onDisplayChanged(displayId: Int) {
                // A 180° flip between the two landscape orientations changes how the sensor maps to "up".
                submit { stream?.getGlInterface()?.forceOrientation(OrientationForced.NONE) }
            }
        }
        displayListener = listener
        manager.registerDisplayListener(listener, Threads.main)
    }

    private fun unregisterDisplayListener() {
        val listener = displayListener ?: return
        displayListener = null
        (app.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager).unregisterDisplayListener(listener)
    }

    // ── Preview ──────────────────────────────────────────────────────────────

    fun setPreviewFill(fill: Boolean) {
        previewFill = fill
        stream?.getGlInterface()?.setAspectRatioMode(if (fill) AspectRatioMode.Fill else AspectRatioMode.Adjust)
    }

    fun captureThumbnail(result: (String?) -> Unit) = submit {
        val surface = previewSurface
        if (Build.VERSION.SDK_INT < 26 || surface == null || !surface.isValid || previewWidth <= 0 || previewHeight <= 0) {
            result(null)
            return@submit
        }
        val width = 240
        val height = (width * previewHeight / previewWidth).coerceIn(64, 360)
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        try {
            PixelCopy.request(surface, bitmap, { code ->
                try {
                    if (code != PixelCopy.SUCCESS) result(null)
                    else {
                        val bytes = ByteArrayOutputStream().use { output ->
                            bitmap.compress(Bitmap.CompressFormat.JPEG, 65, output)
                            output.toByteArray()
                        }
                        result("data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP))
                    }
                } catch (_: Exception) {
                    result(null)
                } finally {
                    bitmap.recycle()
                }
            }, handler)
        } catch (_: Exception) {
            bitmap.recycle()
            result(null)
        }
    }

    fun onPreviewSurface(surface: Surface, width: Int, height: Int) = submit {
        previewSurface = surface
        previewWidth = width
        previewHeight = height
        val current = stream ?: return@submit
        if (current.isOnPreview) current.getGlInterface().setPreviewResolution(width, height) else startPreviewIfPossible()
    }

    /** Called from SurfaceHolder.surfaceDestroyed: the surface must not be touched once that returns. */
    fun detachPreviewBlocking() {
        val done = CountDownLatch(1)
        handler.post {
            try {
                previewSurface = null
                stream?.let { if (it.isOnPreview) it.stopPreview() }
                if (state == "preview") setState("prepared", mode, null)
            } catch (t: Throwable) {
                Log.w(TAG, "detach preview failed", t)
            } finally {
                done.countDown()
            }
        }
        done.await(1_500, TimeUnit.MILLISECONDS)
    }

    private fun startPreviewIfPossible() {
        val current = stream ?: return
        val surface = previewSurface ?: return
        if (!surface.isValid || current.isOnPreview || previewWidth <= 0 || previewHeight <= 0) return
        try {
            current.startPreview(surface, previewWidth, previewHeight)
        } catch (e: Exception) {
            emitError("preview", "Could not start the preview: ${e.message}", false)
            return
        }
        afterGlStarted()
        if (state == "prepared") setState("preview", mode, null)
    }

    /** Filters and stabilisation are lost whenever the GL pipeline stops, so they are re-applied after every start. */
    private fun afterGlStarted() {
        setPreviewFill(previewFill)
        applyStabilization()
        rebindOverlays()
        val expectedCamera = cameraRef
        handler.postDelayed({
            if (cameraRef === expectedCamera && expectedCamera?.isRunning() == true && proControls != "{}") runCatching { setCameraProControls(proControls) }
        }, 800)
    }

    // ── Streaming (RTMP / RTMPS / SRT) ───────────────────────────────────────

    fun startStream(destinationsJson: String) {
        val specs = Models.parseDestinations(destinationsJson)
        if (mode != "studio") throw StudioException("not_prepared", "Prepare the studio first")
        if (stream?.hasSinks() == true) throw StudioException("busy", "Already streaming")
        if (needsPrepare) reprepare()
        val current = stream ?: throw StudioException("not_prepared", "The camera is not ready")
        val cfg = config ?: throw StudioException("not_prepared", "The camera is not ready")

        if (cfg.autoOrientation) lockOrientation(cfg.video.rotation)
        destinations.clear()
        everLive = false
        specs.forEach { destinations[it.id] = DestinationInfo("connecting") }
        try {
            current.startEncoders()
        } catch (e: Exception) {
            destinations.clear()
            if (cfg.autoOrientation) lockOrientation(cfg.video.rotation, automatic = true)
            throw StudioException("encoder", "Could not start the encoder: ${e.message}", e)
        }
        afterGlStarted()
        sessionStart = System.currentTimeMillis()
        abr?.reset(cfg.video.bitrateBps, cfg.video.minBitrateBps)
        StudioService.start(app, "Streaming live", "${specs.size} destination${if (specs.size == 1) "" else "s"}")
        for (spec in specs) {
            val sink = current.addDestination(spec, MAX_RETRIES)
            emitDestination(spec.id)
            sink.connect()
        }
        setState("connecting", mode, null)
    }

    fun stopStream() {
        val current = stream ?: return
        if (!current.hasSinks() && destinations.isEmpty()) return
        setState("stopping", mode, null)
        endSession(current)
    }

    private fun endSession(current: StudioStream) {
        if (!current.stopDestinations()) needsPrepare = true
        destinations.clear()
        everLive = false
        config?.takeIf { it.autoOrientation && !current.isRecording && !current.hasServer() }?.let { lockOrientation(it.video.rotation, automatic = true) }
        if (!current.isRecording && !current.hasServer()) StudioService.stop(app)
        setState(if (current.isOnPreview) "preview" else "prepared", mode, null)
    }

    private fun recomputeState() {
        val current = stream ?: return
        if (current.hasServer() || destinations.isEmpty()) return
        val states = destinations.values.map { it.state }
        val next = when {
            states.any { it == "live" } -> "live"
            states.any { it == "retrying" } -> if (everLive) "reconnecting" else "connecting"
            states.any { it == "connecting" } -> "connecting"
            else -> state
        }
        if (next == "live") everLive = true
        setState(next, mode, null)
    }

    private val sinkListener = object : StudioStream.Listener {
        override fun onSinkConnecting(id: String) = submit { update(id, "connecting", null, 0) }
        override fun onSinkConnected(id: String) = submit { update(id, "live", null, 0) }
        override fun onSinkRetrying(id: String, attempt: Int, reason: String) = submit { update(id, "retrying", reason, attempt) }
        override fun onSinkFailed(id: String, reason: String) = submit {
            update(id, "failed", reason, 0)
            val current = stream ?: return@submit
            if (destinations.isNotEmpty() && destinations.values.all { it.state == "failed" }) {
                endSession(current)
                emitError("destinations", "Could not reach any destination: $reason", false)
            }
        }
        override fun onSinkClosed(id: String) = submit { if (destinations[id]?.state != "failed") update(id, "stopped", null, 0) }
        override fun onSinkBitrate(id: String, bps: Long) = Unit
        override fun onServerError(reason: String) = submit { emitError("server", reason, false) }
    }

    private fun update(id: String, newState: String, reason: String?, attempt: Int) {
        val info = destinations[id] ?: return
        info.state = newState
        info.reason = reason
        info.attempt = attempt
        emitDestination(id)
        recomputeState()
    }

    // ── LAN camera role (RTSP server) ────────────────────────────────────────

    private val serverChecker = object : ConnectChecker {
        override fun onConnectionStarted(url: String) = Unit
        override fun onConnectionSuccess() = Unit
        override fun onConnectionFailed(reason: String) = sinkListener.onServerError(reason)
        override fun onDisconnect() = Unit
        override fun onAuthError() = Unit
        override fun onAuthSuccess() = Unit
    }

    fun startCameraServer(port: Int): String {
        if (port !in 1024..65535) throw StudioException("invalid_argument", "Choose a camera port between 1024 and 65535")
        if (mode != "camera") throw StudioException("not_prepared", "Prepare the camera role first")
        val current = stream ?: throw StudioException("not_prepared", "The camera is not ready")
        if (needsPrepare) reprepare()
        val active = stream ?: current
        if (!active.hasServer()) {
            try {
                active.startEncoders()
                active.startServer(port, serverChecker)
            } catch (e: Exception) {
                runCatching { active.stopServer() }
                throw StudioException("server", "Could not start the camera server: ${e.message}", e)
            }
            afterGlStarted()
            sessionStart = System.currentTimeMillis()
            serverBytes = 0
            StudioService.start(app, "Camera server running", "Other phones can pull this camera over Wi-Fi")
            setState("live", mode, null)
        }
        val ip = Net.lanAddress()?.ip ?: "0.0.0.0"
        return "rtsp://$ip:$port/"
    }

    fun stopCameraServer() {
        val current = stream ?: return
        if (!current.hasServer()) return
        if (!current.stopServer()) needsPrepare = true
        if (!current.isRecording) StudioService.stop(app)
        setState(if (current.isOnPreview) "preview" else "prepared", mode, null)
    }

    // ── Recording ────────────────────────────────────────────────────────────

    fun startRecording(name: String): String {
        if (needsPrepare) reprepare()
        val current = stream ?: throw StudioException("not_prepared", "The camera is not ready")
        if (current.isRecording) throw StudioException("busy", "Already recording")
        if (config?.autoOrientation == true) lockOrientation(config!!.video.rotation)
        val dir = File(app.getExternalFilesDir(Environment.DIRECTORY_MOVIES), "NJSLiveStudio").apply { mkdirs() }
        val safe = name.replace(Regex("[^A-Za-z0-9 _-]"), "").trim().replace(' ', '_').take(40).ifEmpty { "recording" }
        val file = File(dir, "${safe}_${SimpleDateFormat("yyyyMMdd_HHmmss_SSS", Locale.US).format(Date())}.mp4")
        val path = file.absolutePath
        current.startRecord(path, listener = object : RecordController.Listener {
            override fun onStatusChange(status: RecordController.Status) {
                recordStatus = status
                when (status) {
                    RecordController.Status.STARTED -> Events.emit("studio.record") { putString("state", "started"); putString("path", path) }
                    RecordController.Status.STOPPED -> Events.emit("studio.record") { putString("state", "stopped"); putString("path", path) }
                    RecordController.Status.PAUSED -> Events.emit("studio.record") { putString("state", "paused"); putString("path", path) }
                    RecordController.Status.RESUMED -> Events.emit("studio.record") { putString("state", "resumed"); putString("path", path) }
                    else -> Unit
                }
            }

            override fun onError(e: Exception?) {
                Events.emit("studio.record") { putString("state", "error"); putString("message", e?.message ?: "write failed") }
            }
        })
        recordingPath = path
        recordingPaused = false
        StudioService.start(app, "Recording video", "Your clip is being recorded on this phone")
        afterGlStarted()
        return path
    }

    fun stopRecording() {
        val current = stream ?: return
        if (!current.isRecording) return
        if (!current.stopRecord()) needsPrepare = true
        recordingPath = null
        if (!current.hasSinks() && !current.hasServer()) StudioService.stop(app)
        config?.takeIf { it.autoOrientation && !current.hasSinks() && !current.hasServer() }?.let { lockOrientation(it.video.rotation, automatic = true) }
    }

    fun pauseRecording() {
        val current = stream ?: throw StudioException("not_prepared", "The camera is not ready")
        if (!current.isRecording || recordingPaused) return
        require(recordStatus == RecordController.Status.RECORDING) { "The recording is starting. Try pausing again in a moment." }
        current.pauseRecord()
        recordingPaused = true
    }

    fun resumeRecording() {
        val current = stream ?: throw StudioException("not_prepared", "The camera is not ready")
        if (!current.isRecording || !recordingPaused) return
        current.resumeRecord()
        recordingPaused = false
    }

    fun captureRawStill(result: (Result<String>) -> Unit) {
        if (hasSession() || stream?.isRecording == true || capturingRaw) throw StudioException("busy", "RAW photos are available only when video recording and streaming are stopped")
        val camera = requireCamera()
        val id = camera.getCurrentCameraId() ?: throw StudioException("camera", "The camera is not ready")
        val json = configJson ?: throw StudioException("camera", "The camera is not prepared")
        val previousMode = mode
        val controls = proControls
        @Suppress("DEPRECATION")
        val rotation = Threads.onMain { ActivityHolder.activity?.windowManager?.defaultDisplay?.rotation ?: Surface.ROTATION_0 }
        val degrees = when (rotation) { Surface.ROTATION_90 -> 90; Surface.ROTATION_180 -> 180; Surface.ROTATION_270 -> 270; else -> 0 }
        teardown()
        capturingRaw = true
        fun restore(outcome: Result<String>) {
            capturingRaw = false
            runCatching { prepare(json, previousMode); proControls = controls }.onFailure { emitError("camera", "RAW capture finished, but preview recovery failed: ${it.message}", false) }
            result(outcome)
        }
        try {
            RawStill(app, handler).capture(id, controls, degrees) { outcome -> restore(outcome.map { it.absolutePath }) }
        } catch (error: Exception) { restore(Result.failure(error)) }
    }

    fun finishCameraRecording(): String {
        val path = recordingPath ?: throw StudioException("recording", "No recording is available to save")
        stopRecording()
        recordingPaused = false
        return path
    }

    // ── Camera controls ──────────────────────────────────────────────────────

    private fun requireCamera(): Camera2Source = cameraRef ?: throw StudioException("not_prepared", "The camera is not ready")

    fun connectorCommand(action: String, value: Double): org.json.JSONObject {
        if (mode != "camera") throw StudioException("role", "This phone is not a connector camera")
        val cam = requireCamera()
        when (action) {
            "flip" -> switchCamera()
            "torch" -> setTorch(value == 1.0)
            "zoom" -> {
                require(value.isFinite()) { "Invalid zoom" }
                val (min, max) = zoomRange()
                setZoom(value.coerceIn(min, max).toFloat())
            }
            "status" -> Unit
            else -> throw IllegalArgumentException("Unsupported camera control")
        }
        val (min, max) = zoomRange()
        return org.json.JSONObject().put("zoom", cam.getZoom().toDouble()).put("minZoom", min).put("maxZoom", max)
            .put("torch", cam.isLanternEnabled()).put("flash", hasFlash(cam))
    }

    fun setVideoBitrate(bps: Int) {
        if (bps < 100_000) throw StudioException("invalid_argument", "Bitrate is too low")
        stream?.setVideoBitrateOnFly(bps)
    }

    fun requestKeyframe() { stream?.requestKeyframe() }

    fun switchCamera() {
        val cam = requireCamera()
        cam.switchCamera()
        applyStabilization()
    }

    fun selectCamera(id: String) {
        requireCamera().openCameraId(id)
        applyStabilization()
    }

    fun setZoom(level: Float) {
        val cam = requireCamera()
        if (cam.isRunning()) cam.setZoom(level)
    }

    fun zoomRange(): Pair<Double, Double> {
        val cam = cameraRef
        if (cam == null || !cam.isRunning()) return 1.0 to 1.0
        val range = cam.getZoomRange()
        return range.lower.toDouble() to range.upper.toDouble()
    }

    fun setTorch(enabled: Boolean): Boolean {
        val cam = requireCamera()
        if (!cam.isRunning()) throw StudioException("not_running", "Start the camera first")
        if (!hasFlash(cam)) throw StudioException("no_torch", "This camera has no torch")
        if (enabled) cam.enableLantern() else cam.disableLantern()
        return cam.isLanternEnabled()
    }

    private fun hasFlash(cam: Camera2Source): Boolean {
        val id = cam.getCurrentCameraId()
        if (id.isNullOrEmpty()) return false
        val manager = app.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        return runCatching { manager.getCameraCharacteristics(id).get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true }.getOrDefault(false)
    }

    fun setExposure(level: Int) { requireCamera().setExposure(level) }

    fun setCameraProControls(json: String) {
        val camera = requireCamera()
        val manager = app.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        val characteristics = manager.getCameraCharacteristics(camera.getCurrentCameraId() ?: throw StudioException("camera", "Camera is not ready"))
        val controls = org.json.JSONObject(json)
        val fps = config?.video?.fps ?: 30
        require(camera.setCustomRequest { builder -> CameraPro.apply(builder, controls, characteristics, 1_000_000_000L / fps) }) { "Camera controls are not ready" }
        proControls = json
    }

    fun exposureRange(): Triple<Int, Int, Double> {
        val cam = cameraRef ?: return Triple(0, 0, 1.0)
        val id = cam.getCurrentCameraId()
        if (!cam.isRunning() || id.isNullOrEmpty()) return Triple(0, 0, 1.0)
        val manager = app.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        return runCatching {
            val c = manager.getCameraCharacteristics(id)
            val range = c.get(CameraCharacteristics.CONTROL_AE_COMPENSATION_RANGE)
            val step = c.get(CameraCharacteristics.CONTROL_AE_COMPENSATION_STEP)
            Triple(range?.lower ?: 0, range?.upper ?: 0, step?.toDouble() ?: 1.0)
        }.getOrDefault(Triple(0, 0, 1.0))
    }

    fun setExposureLock(locked: Boolean) {
        val cam = requireCamera()
        if (!cam.isRunning()) return
        if (locked) cam.enableExposureLock() else cam.disableExposureLock()
    }

    fun setAutoFocus(enabled: Boolean) {
        val cam = requireCamera()
        if (!cam.isRunning()) return
        if (enabled) cam.enableAutoFocus() else cam.disableAutoFocus()
    }

    fun setStabilization(enabled: Boolean) {
        val cfg = config ?: return
        config = cfg.copy(video = cfg.video.copy(stabilization = enabled))
        applyStabilization()
    }

    private fun applyStabilization() {
        val wanted = config?.video?.stabilization ?: return
        // The camera reopens asynchronously after a start or flip, so give it a moment.
        handler.postDelayed({
            val cam = cameraRef ?: return@postDelayed
            if (!cam.isRunning()) return@postDelayed
            if (wanted) {
                if (!cam.enableOpticalVideoStabilization()) cam.enableVideoStabilization()
            } else {
                cam.disableOpticalVideoStabilization()
                cam.disableVideoStabilization()
            }
        }, 800)
    }

    /** Pinch-to-zoom / tap-to-focus from the preview view (main thread). */
    fun gestureCamera(): Camera2Source? = cameraRef

    // ── Audio ────────────────────────────────────────────────────────────────

    fun setMuted(value: Boolean) {
        muted = value
        val microphone = mic ?: return
        if (value) microphone.mute() else microphone.unMute()
    }

    fun setMicVolume(volume: Float) {
        micVolume = volume.coerceIn(0f, 4f)
        mic?.microphoneVolume = micVolume
    }

    /** @return true when applied to the running microphone; otherwise it is applied when the camera starts. */
    fun setAudioInput(deviceId: Int): Boolean {
        val manager = app.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val device = if (deviceId < 0) null else manager.getDevices(AudioManager.GET_DEVICES_INPUTS).firstOrNull { it.id == deviceId }
            ?: throw StudioException("not_found", "That microphone is no longer connected")
        preferredAudioDevice = device
        routeAudio(manager, device)
        val microphone = mic ?: return false
        return microphone.setPreferredDevice(device)
    }

    @Suppress("DEPRECATION")
    private fun routeAudio(manager: AudioManager, device: AudioDeviceInfo?) {
        val bluetooth = device != null && (device.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
            (Build.VERSION.SDK_INT >= 31 && device.type == AudioDeviceInfo.TYPE_BLE_HEADSET))
        try {
            if (bluetooth) {
                if (Build.VERSION.SDK_INT >= 31) manager.setCommunicationDevice(device!!)
                else { manager.startBluetoothSco(); manager.isBluetoothScoOn = true }
                routedToBluetooth = true
            } else if (routedToBluetooth) {
                releaseAudioRouting()
            }
        } catch (e: SecurityException) {
            throw StudioException("permission", "Allow Bluetooth access to use a Bluetooth microphone", e)
        }
    }

    @Suppress("DEPRECATION")
    private fun releaseAudioRouting() {
        if (!routedToBluetooth) return
        routedToBluetooth = false
        runCatching {
            val manager = app.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            if (Build.VERSION.SDK_INT >= 31) manager.clearCommunicationDevice()
            else { manager.isBluetoothScoOn = false; manager.stopBluetoothSco() }
        }
    }

    // ── Overlays ─────────────────────────────────────────────────────────────

    fun setOverlays(json: String) {
        val specs = Models.parseOverlays(json)
        overlaySpecs = specs
        Threads.onMain { overlays.setSpecs(specs) }
        rebindOverlays()
    }

    fun setOverlayOptions(fps: Int, hardware: Boolean) {
        overlayFps = fps.coerceIn(1, 30)
        overlayHardware = hardware
        val cfg = config
        Threads.onMain {
            overlays.configure(cfg?.video?.frameWidth ?: 1920, cfg?.video?.frameHeight ?: 1080, overlayFps, overlayHardware)
        }
        rebindOverlays()
    }

    fun reloadOverlays() { Threads.onMain { overlays.reloadAll() } }

    private fun rebindOverlays() {
        val current = stream ?: return
        val gl = current.getGlInterface()
        if (!gl.isRunning) return
        Threads.onMain { overlays.bind(gl) }
    }

    // ── Video source switching (multi-camera) ────────────────────────────────

    fun selectLocalSource() {
        val current = stream ?: throw StudioException("not_prepared", "The camera is not ready")
        if (peerSource == null) return
        current.changeVideoSource(requireCamera())
        peerSource = null
        Events.emit("studio.source") { putString("source", "local"); putString("state", "ok") }
    }

    fun selectPeerSource(url: String) {
        val current = stream ?: throw StudioException("not_prepared", "The camera is not ready")
        if (!url.startsWith("rtsp://", true) || url.length > 300) throw StudioException("invalid_argument", "That is not an RTSP camera address")
        var created: PeerRtspVideoSource? = null
        val source = PeerRtspVideoSource(app, url) { reason ->
            submit {
                if (peerSource == null || peerSource !== created) return@submit
                runCatching { selectLocalSource() }
                Events.emit("studio.source") { putString("source", "peer"); putString("url", url); putString("state", "failed"); putString("reason", reason) }
            }
        }
        try {
            current.changeVideoSource(source)
        } catch (e: IllegalArgumentException) {
            throw StudioException("unsupported", e.message ?: "That camera feed cannot be used", e)
        }
        created = source
        peerSource = source
        Events.emit("studio.source") { putString("source", "peer"); putString("url", url); putString("state", "ok") }
    }

    // ── Encoder errors ───────────────────────────────────────────────────────

    private val codecErrors = object : CodecErrorCallback {
        override fun onCodecError(type: CodecUtil.CodecTypeError, e: MediaCodec.CodecException) {
            submit {
                val current = stream ?: return@submit
                val recovered = if (type == CodecUtil.CodecTypeError.VIDEO_CODEC) current.resetVideoEncoder() else current.resetAudioEncoder()
                emitError("encoder", "The ${if (type == CodecUtil.CodecTypeError.VIDEO_CODEC) "video" else "audio"} encoder stopped (${e.diagnosticInfo}).${if (recovered) " It was restarted." else ""}", !recovered)
                if (!recovered) {
                    if (current.hasSinks()) endSession(current)
                    setState("error", mode, "The encoder failed")
                }
            }
        }
    }

    // ── Stats / adaptive bitrate (1 Hz) ──────────────────────────────────────

    private fun startStats() {
        stopStats()
        val task = object : Runnable {
            override fun run() {
                try {
                    tick()
                } catch (t: Throwable) {
                    Log.w(TAG, "stats tick failed", t)
                }
                handler.postDelayed(this, 1_000)
            }
        }
        statsTask = task
        handler.postDelayed(task, 1_000)
    }

    private fun stopStats() {
        statsTask?.let { handler.removeCallbacks(it) }
        statsTask = null
    }

    private fun tick() {
        val current = stream ?: return
        val cfg = config ?: return
        val sinks = current.sinkList()
        val live = sinks.filter { it.isStreaming }
        if (cfg.video.adaptive && sinks.isNotEmpty()) {
            abr?.tick(live.any { runCatching { it.client.hasCongestion() }.getOrDefault(false) })
        }

        var kbps = live.maxOfOrNull { it.kbps } ?: 0L
        val clients = current.serverClients()
        if (current.hasServer()) {
            val sent = current.serverBytesSent()
            serverKbps = if (sent >= serverBytes) (sent - serverBytes) * 8 / 1000 else 0L
            serverBytes = sent
            kbps = serverKbps
        }
        val cam = cameraRef
        val running = cam?.isRunning() == true
        val list = Arguments.createArray()
        for ((id, info) in destinations) {
            val sink = sinks.firstOrNull { it.spec.id == id }
            list.pushMap(Arguments.createMap().apply {
                putString("id", id)
                putDouble("kbps", (sink?.kbps ?: 0L).toDouble())
                putDouble("dropped", (sink?.droppedFrames ?: 0L).toDouble())
                putString("state", info.state)
            })
        }
        Events.emit("studio.stats") {
            putString("state", state)
            putDouble("bitrateKbps", kbps.toDouble())
            putDouble("targetKbps", ((abr?.currentBps ?: cfg.video.bitrateBps) / 1000).toDouble())
            putInt("fps", if (current.isStreaming || current.isRecording) lastFps else if (running) cfg.video.fps else 0)
            putDouble("dropped", sinks.sumOf { it.droppedFrames }.toDouble())
            putDouble("uptimeMs", if (sessionStart > 0 && (destinations.isNotEmpty() || current.hasServer())) (System.currentTimeMillis() - sessionStart).toDouble() else 0.0)
            putDouble("zoom", if (running) (cam?.getZoom() ?: 1f).toDouble() else 1.0)
            putBoolean("torch", running && cam?.isLanternEnabled() == true)
            putBoolean("muted", muted)
            putBoolean("recording", current.isRecording)
            putBoolean("recordingPaused", recordingPaused)
            putArray("destinations", list)
            putInt("clients", clients)
        }
    }

    // ── Events ───────────────────────────────────────────────────────────────

    private fun setState(newState: String, newMode: String, newMessage: String?) {
        if (state == newState && mode == newMode && message == newMessage) return
        state = newState
        mode = newMode
        message = newMessage
        Events.emit("studio.state") {
            putString("state", state)
            putString("mode", mode)
            if (newMessage != null) putString("message", newMessage)
        }
    }

    private fun emitDestination(id: String) {
        val info = destinations[id] ?: return
        Events.emit("studio.destination") {
            putString("id", id)
            putString("state", info.state)
            info.reason?.let { putString("reason", it) }
            if (info.attempt > 0) putInt("attempt", info.attempt)
        }
    }

    private fun emitError(code: String, text: String, fatal: Boolean) {
        Log.w(TAG, "$code: $text")
        Events.emit("studio.error") { putString("code", code); putString("message", text); putBoolean("fatal", fatal) }
    }
}
