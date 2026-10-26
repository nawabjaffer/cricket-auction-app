package com.njsstore.livestudio.studio

import android.media.MediaCodec
import android.media.MediaFormat
import android.media.MediaMuxer
import com.pedro.library.base.recording.RecordController
import com.pedro.library.util.AndroidMuxerRecordController
import org.json.JSONObject
import java.io.File
import java.nio.ByteBuffer
import java.util.ArrayDeque

class ReplayRecorder(private val recorder: RecordController = AndroidMuxerRecordController()) : RecordController by recorder {
    data class Sample(val video: Boolean, val timeUs: Long, val flags: Int, val data: ByteArray)
    data class Snapshot(val samples: List<Sample>, val videoFormat: MediaFormat, val audioFormat: MediaFormat?) {
        fun write(file: File): String {
            require(samples.any { it.video }) { "The replay buffer has no video yet" }
            val muxer = MediaMuxer(file.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
            var started = false
            try {
                val videoTrack = muxer.addTrack(videoFormat)
                val audioTrack = if (audioFormat != null && samples.any { !it.video }) muxer.addTrack(audioFormat) else -1
                muxer.start(); started = true
                val origin = samples.first { it.video }.timeUs
                var lastVideo = -1L
                var lastAudio = -1L
                for (sample in samples.sortedBy { it.timeUs }) {
                    val timestamp = sample.timeUs - origin
                    if (timestamp < 0 || (!sample.video && audioTrack < 0)) continue
                    if (sample.video && timestamp <= lastVideo || !sample.video && timestamp <= lastAudio) continue
                    val info = MediaCodec.BufferInfo().apply { set(0, sample.data.size, timestamp, sample.flags and MediaCodec.BUFFER_FLAG_KEY_FRAME) }
                    muxer.writeSampleData(if (sample.video) videoTrack else audioTrack, ByteBuffer.wrap(sample.data), info)
                    if (sample.video) lastVideo = timestamp else lastAudio = timestamp
                }
                require(lastVideo > 0) { "Not enough recorded video for a highlight yet" }
                muxer.stop(); started = false
                return JSONObject().put("path", file.absolutePath).put("durationMs", lastVideo / 1000).put("bytes", file.length()).toString()
            } catch (error: Exception) { file.delete(); throw error }
            finally { if (started) runCatching { muxer.stop() }; muxer.release() }
        }
    }

    private val samples = ArrayDeque<Sample>()
    private var videoFormat: MediaFormat? = null
    private var audioFormat: MediaFormat? = null
    private var bytes = 0L
    private var pauseAtUs = 0L
    private var pausedUs = 0L
    @Volatile private var paused = false
    @Volatile private var seconds = 0

    @Synchronized
    fun configure(windowSeconds: Int) {
        seconds = windowSeconds.coerceIn(0, 60)
        if (seconds == 0) { samples.clear(); bytes = 0 }
    }

    override fun setVideoFormat(format: MediaFormat) { videoFormat = copyFormat(format); recorder.setVideoFormat(format) }
    override fun setAudioFormat(format: MediaFormat) { audioFormat = copyFormat(format); recorder.setAudioFormat(format) }

    override fun recordVideo(buffer: ByteBuffer, info: MediaCodec.BufferInfo) {
        append(true, buffer, info)
        recorder.recordVideo(buffer, info)
    }

    override fun recordAudio(buffer: ByteBuffer, info: MediaCodec.BufferInfo) {
        append(false, buffer, info)
        recorder.recordAudio(buffer, info)
    }

    @Synchronized
    private fun append(video: Boolean, buffer: ByteBuffer, info: MediaCodec.BufferInfo) {
        if (seconds == 0 || paused || !recorder.isRunning() || info.size <= 0 || info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) return
        if (info.size > MAX_BYTES || info.offset < 0 || info.offset.toLong() + info.size > buffer.capacity()) return
        val copy = ByteArray(info.size)
        buffer.duplicate().apply { clear(); position(info.offset); limit(info.offset + info.size); get(copy) }
        val sample = Sample(video, info.presentationTimeUs - pausedUs, info.flags, copy)
        samples.addLast(sample); bytes += copy.size
        val oldest = sample.timeUs - (seconds + 3L) * 1_000_000
        while (samples.isNotEmpty() && (samples.first.timeUs < oldest || bytes > MAX_BYTES)) bytes -= samples.removeFirst().data.size
    }

    @Synchronized
    fun snapshot(windowSeconds: Int, ageMs: Long): Snapshot {
        val format = videoFormat ?: throw IllegalStateException("Wait for recorded video before saving highlights")
        val end = (samples.lastOrNull { it.video }?.timeUs ?: throw IllegalStateException("The replay buffer is empty")) - ageMs.coerceIn(0, 60_000) * 1000
        val start = end - windowSeconds.coerceIn(5, 60) * 1_000_000L
        val keyframe = samples.firstOrNull { it.video && it.timeUs >= start && it.timeUs <= end && it.flags and MediaCodec.BUFFER_FLAG_KEY_FRAME != 0 }
            ?: throw IllegalStateException("No playable keyframe is available in this replay window")
        return Snapshot(samples.filter { it.timeUs >= keyframe.timeUs && it.timeUs <= end }, format, audioFormat)
    }

    override fun pauseRecord() {
        recorder.pauseRecord()
        if (!paused && recorder.getStatus() == RecordController.Status.PAUSED) { paused = true; pauseAtUs = System.nanoTime() / 1000 }
    }

    override fun resumeRecord() {
        if (paused) { synchronized(this) { pausedUs += System.nanoTime() / 1000 - pauseAtUs; paused = false } }
        recorder.resumeRecord()
    }

    override fun stopRecord() {
        recorder.stopRecord()
        synchronized(this) { samples.clear(); bytes = 0; pausedUs = 0; paused = false }
    }

    override fun resetFormats() {
        recorder.resetFormats()
        synchronized(this) { videoFormat = null; audioFormat = null; samples.clear(); bytes = 0; pausedUs = 0; paused = false }
    }

    private fun copyFormat(source: MediaFormat): MediaFormat = MediaFormat().apply {
        for (key in listOf(MediaFormat.KEY_MIME)) if (source.containsKey(key)) setString(key, source.getString(key)!!)
        for (key in listOf(MediaFormat.KEY_WIDTH, MediaFormat.KEY_HEIGHT, MediaFormat.KEY_SAMPLE_RATE, MediaFormat.KEY_CHANNEL_COUNT)) if (source.containsKey(key)) setInteger(key, source.getInteger(key))
        for (key in listOf("csd-0", "csd-1", "csd-2")) source.getByteBuffer(key)?.let { value ->
            val data = value.duplicate().apply { rewind() }
            val copy = ByteArray(data.remaining()); data.get(copy); setByteBuffer(key, ByteBuffer.wrap(copy))
        }
    }

    companion object { private const val MAX_BYTES = 40L * 1024 * 1024 }
}