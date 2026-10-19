package com.njsstore.livestudio.studio

import android.content.Context
import android.media.MediaCodec
import com.pedro.common.AudioCodec
import com.pedro.common.ConnectChecker
import com.pedro.common.VideoCodec
import com.pedro.encoder.input.sources.audio.AudioSource
import com.pedro.encoder.input.sources.video.VideoSource
import com.pedro.library.base.StreamBase
import com.pedro.library.util.streamclient.RtmpStreamClient
import com.pedro.library.util.streamclient.SrtStreamClient
import com.pedro.library.util.streamclient.StreamBaseClient
import com.pedro.library.util.streamclient.StreamClientListener
import com.pedro.rtmp.rtmp.RtmpClient
import com.pedro.rtspserver.server.RtspServer
import com.pedro.srt.srt.SrtClient
import java.nio.ByteBuffer
import java.util.concurrent.CopyOnWriteArrayList

/**
 * One encoder feeding any number of RTMP/RTMPS/SRT destinations plus an optional RTSP server (LAN camera role).
 *
 * RootEncoder's MultiStream needs the destination count up front and never stops its encoder through
 * stopStream(type, index), so destinations are managed here and the shared encoder is started/stopped explicitly.
 */
class StudioStream(
    context: Context,
    videoSource: VideoSource,
    audioSource: AudioSource,
    private val listener: Listener,
) : StreamBase(context, videoSource, audioSource) {

    interface Listener {
        fun onSinkConnecting(id: String)
        fun onSinkConnected(id: String)
        fun onSinkRetrying(id: String, attempt: Int, reason: String)
        fun onSinkFailed(id: String, reason: String)
        fun onSinkClosed(id: String)
        fun onSinkBitrate(id: String, bps: Long)
        fun onServerError(reason: String)
    }

    class Sink internal constructor(val spec: DestinationSpec, checker: ConnectChecker, keyframes: StreamClientListener) {
        private val rtmp: RtmpClient? = if (spec.protocol == "rtmp") RtmpClient(checker).apply { tlsHostVerification = true } else null
        private val srt: SrtClient? = if (spec.protocol == "srt") SrtClient(checker) else null
        val client: StreamBaseClient = rtmp?.let { RtmpStreamClient(it, keyframes) } ?: SrtStreamClient(requireNotNull(srt), keyframes)

        @Volatile var attempt = 0
        @Volatile var kbps = 0L
        @Volatile var failed = false
        @Volatile var stopping = false

        val isStreaming: Boolean get() = rtmp?.isStreaming ?: srt?.isStreaming ?: false
        val droppedFrames: Long get() = rtmp?.droppedVideoFrames ?: srt?.droppedVideoFrames ?: 0L

        fun connect() {
            rtmp?.connect(spec.url)
            srt?.connect(spec.url)
        }

        fun disconnect() {
            rtmp?.disconnect()
            srt?.disconnect()
        }

        fun setVideoCodec(codec: VideoCodec) { rtmp?.setVideoCodec(codec); srt?.setVideoCodec(codec) }
        fun setAudioCodec(codec: AudioCodec) { rtmp?.setAudioCodec(codec); srt?.setAudioCodec(codec) }
        fun setAudioInfo(sampleRate: Int, stereo: Boolean) { rtmp?.setAudioInfo(sampleRate, stereo); srt?.setAudioInfo(sampleRate, stereo) }
        fun setVideoInfo(sps: ByteBuffer, pps: ByteBuffer?, vps: ByteBuffer?) {
            rtmp?.setVideoInfo(sps.duplicate(), pps?.duplicate(), vps?.duplicate())
            srt?.setVideoInfo(sps.duplicate(), pps?.duplicate(), vps?.duplicate())
        }
        fun setVideoResolution(width: Int, height: Int, fps: Int) { rtmp?.setVideoResolution(width, height); rtmp?.setFps(fps) }
        fun sendVideo(buffer: ByteBuffer, info: MediaCodec.BufferInfo) { rtmp?.sendVideo(buffer, info); srt?.sendVideo(buffer, info) }
        fun sendAudio(buffer: ByteBuffer, info: MediaCodec.BufferInfo) { rtmp?.sendAudio(buffer, info); srt?.sendAudio(buffer, info) }
    }

    private val sinks = CopyOnWriteArrayList<Sink>()
    private var server: RtspServer? = null

    private var audioSampleRate = 0
    private var audioStereo = true
    private var sps: ByteBuffer? = null
    private var pps: ByteBuffer? = null
    private var vps: ByteBuffer? = null
    private var videoCodec = VideoCodec.H264
    private var audioCodec = AudioCodec.AAC

    private val keyframeRequests = object : StreamClientListener {
        override fun onRequestKeyframe() = requestKeyframe()
    }

    // ── Destinations ─────────────────────────────────────────────────────────

    fun sinkList(): List<Sink> = sinks.toList()

    fun hasSinks(): Boolean = sinks.isNotEmpty()

    fun addDestination(spec: DestinationSpec, retries: Int): Sink {
        val checker = object : ConnectChecker {
            override fun onConnectionStarted(url: String) = listener.onSinkConnecting(spec.id)
            override fun onConnectionSuccess() {
                val sink = sinks.firstOrNull { it.spec.id == spec.id } ?: return
                sink.attempt = 0
                sink.client.setReTries(retries)
                listener.onSinkConnected(spec.id)
            }
            override fun onConnectionFailed(reason: String) {
                val sink = sinks.firstOrNull { it.spec.id == spec.id } ?: return
                if (sink.stopping) return
                val next = sink.attempt + 1
                if (sink.client.reTry(retryDelayMs(next), reason)) {
                    sink.attempt = next
                    listener.onSinkRetrying(spec.id, next, reason)
                } else {
                    sink.failed = true
                    sink.disconnect()
                    listener.onSinkFailed(spec.id, reason)
                }
            }
            override fun onDisconnect() {
                val sink = sinks.firstOrNull { it.spec.id == spec.id } ?: return
                if (!sink.failed) listener.onSinkClosed(spec.id)
            }
            override fun onAuthError() {
                val sink = sinks.firstOrNull { it.spec.id == spec.id } ?: return
                sink.failed = true
                sink.disconnect()
                listener.onSinkFailed(spec.id, "The server rejected the credentials — check the stream key")
            }
            override fun onAuthSuccess() = Unit
            override fun onNewBitrate(bitrate: Long) {
                sinks.firstOrNull { it.spec.id == spec.id }?.kbps = bitrate / 1000
                listener.onSinkBitrate(spec.id, bitrate)
            }
        }
        val sink = Sink(spec, checker, keyframeRequests)
        sink.setVideoCodec(videoCodec)
        sink.setAudioCodec(audioCodec)
        if (audioSampleRate > 0) sink.setAudioInfo(audioSampleRate, audioStereo)
        val resolution = getVideoResolutionSize()
        sink.setVideoResolution(resolution.first, resolution.second, getVideoFpsValue())
        sps?.let { sink.setVideoInfo(it, pps, vps) }
        sink.client.setReTries(retries)
        sinks += sink
        return sink
    }

    private fun retryDelayMs(attempt: Int): Long = (1000L * attempt).coerceIn(1000L, 8000L)

    /** Starts the shared video/audio encoders (idempotent). */
    fun startEncoders() {
        if (!isStreaming) startStream("")
    }

    /** Disconnects everything without touching the encoders; used right before [release]. */
    fun abandon() {
        sinks.forEach { it.stopping = true; it.disconnect() }
        sinks.clear()
        server?.let { runCatching { it.stopServer() } }
        server = null
    }

    /** Disconnects every destination and stops the encoders unless a server still needs them. */
    fun stopDestinations(): Boolean {
        sinks.forEach { it.stopping = true; it.disconnect() }
        sinks.clear()
        return stopEncodersIfIdle()
    }

    fun removeDestination(id: String): Boolean {
        val sink = sinks.firstOrNull { it.spec.id == id } ?: return false
        sink.stopping = true
        sink.disconnect()
        sinks.remove(sink)
        return stopEncodersIfIdle()
    }

    /** @return false when the encoders could not be re-prepared and the engine must be prepared again. */
    private fun stopEncodersIfIdle(): Boolean {
        if (sinks.isNotEmpty() || server != null || !isStreaming) return true
        return stopStream()
    }

    // ── RTSP server (LAN camera) ─────────────────────────────────────────────

    fun startServer(port: Int, checker: ConnectChecker) {
        val rtsp = RtspServer(checker, port)
        rtsp.setVideoCodec(videoCodec)
        rtsp.setAudioCodec(audioCodec)
        if (audioSampleRate > 0) rtsp.setAudioInfo(audioSampleRate, audioStereo)
        sps?.let { rtsp.setVideoInfo(it.duplicate(), pps?.duplicate(), vps?.duplicate()) }
        server = rtsp
        rtsp.startServer()
    }

    fun stopServer(): Boolean {
        val rtsp = server ?: return true
        server = null
        runCatching { rtsp.stopServer() }
        return stopEncodersIfIdle()
    }

    fun serverClients(): Int = server?.getNumClients() ?: 0

    fun serverBytesSent(): Long = server?.bytesSend ?: 0L

    fun hasServer(): Boolean = server != null

    // ── StreamBase plumbing ──────────────────────────────────────────────────

    private fun getVideoResolutionSize(): Pair<Int, Int> = getVideoResolution().let { it.width to it.height }

    private fun getVideoFpsValue(): Int = getVideoFps()

    override fun onAudioInfoImp(sampleRate: Int, isStereo: Boolean) {
        audioSampleRate = sampleRate
        audioStereo = isStereo
        sinks.forEach { it.setAudioInfo(sampleRate, isStereo) }
        server?.setAudioInfo(sampleRate, isStereo)
    }

    override fun startStreamImp(endPoint: String) = Unit

    override fun stopStreamImp() {
        sps = null
        pps = null
        vps = null
    }

    override fun onVideoInfoImp(sps: ByteBuffer, pps: ByteBuffer?, vps: ByteBuffer?) {
        this.sps = sps.copyBuffer()
        this.pps = pps?.copyBuffer()
        this.vps = vps?.copyBuffer()
        sinks.forEach { it.setVideoInfo(sps, pps, vps) }
        server?.setVideoInfo(sps.duplicate(), pps?.duplicate(), vps?.duplicate())
    }

    override fun getVideoDataImp(videoBuffer: ByteBuffer, info: MediaCodec.BufferInfo) {
        for (sink in sinks) if (sink.isStreaming) sink.sendVideo(videoBuffer.duplicate(), info)
        server?.sendVideo(videoBuffer.duplicate(), info)
    }

    override fun getAudioDataImp(audioBuffer: ByteBuffer, info: MediaCodec.BufferInfo) {
        for (sink in sinks) if (sink.isStreaming) sink.sendAudio(audioBuffer.duplicate(), info)
        server?.sendAudio(audioBuffer.duplicate(), info)
    }

    override fun getStreamClient(): StreamBaseClient =
        throw IllegalStateException("Destinations are managed per sink; use sinkList()")

    override fun setVideoCodecImp(codec: VideoCodec) {
        videoCodec = codec
        sinks.forEach { it.setVideoCodec(codec) }
        server?.setVideoCodec(codec)
    }

    override fun setAudioCodecImp(codec: AudioCodec) {
        audioCodec = codec
        sinks.forEach { it.setAudioCodec(codec) }
        server?.setAudioCodec(codec)
    }

    private fun ByteBuffer.copyBuffer(): ByteBuffer {
        val source = duplicate()
        return ByteBuffer.allocateDirect(source.remaining()).put(source).also { it.flip() }
    }
}
