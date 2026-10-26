package com.njsstore.livestudio.studio

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaExtractor
import android.media.MediaFormat
import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.pedro.library.base.recording.RecordController
import com.pedro.library.util.AndroidMuxerRecordController
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.nio.ByteBuffer

@RunWith(AndroidJUnit4::class)
class ReplayRecorderTest {
    private fun generatedReplay(): ReplayRecorder {
        val sink = object : RecordController by AndroidMuxerRecordController() {
            override fun isRunning() = true
            override fun recordVideo(buffer: ByteBuffer, info: MediaCodec.BufferInfo) = Unit
            override fun recordAudio(buffer: ByteBuffer, info: MediaCodec.BufferInfo) = Unit
        }
        val replay = ReplayRecorder(sink).apply { configure(5) }
        val codec = MediaCodec.createEncoderByType("video/avc")
        val format = MediaFormat.createVideoFormat("video/avc", 160, 96).apply {
            setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible)
            setInteger(MediaFormat.KEY_BIT_RATE, 300_000)
            setInteger(MediaFormat.KEY_FRAME_RATE, 15)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
        }
        codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        codec.start()
        val info = MediaCodec.BufferInfo()
        var frame = 0
        var finished = false
        val deadline = SystemClock.elapsedRealtime() + 25_000
        try {
            while (!finished && SystemClock.elapsedRealtime() < deadline) {
                if (frame <= 120) {
                    val inputIndex = codec.dequeueInputBuffer(10_000)
                    if (inputIndex >= 0) {
                        val input = codec.getInputBuffer(inputIndex)!!
                        input.clear()
                        val data = if (frame == 120) ByteArray(0) else ByteArray(160 * 96 * 3 / 2) { index -> if (index < 160 * 96) (32 + frame % 160).toByte() else 128.toByte() }
                        input.put(data)
                        codec.queueInputBuffer(inputIndex, 0, data.size, frame * 1_000_000L / 15, if (frame == 120) MediaCodec.BUFFER_FLAG_END_OF_STREAM else 0)
                        frame++
                    }
                }
                val outputIndex = codec.dequeueOutputBuffer(info, 10_000)
                if (outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) replay.setVideoFormat(codec.outputFormat)
                if (outputIndex >= 0) {
                    if (info.size > 0) replay.recordVideo(codec.getOutputBuffer(outputIndex)!!, info)
                    finished = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
                    codec.releaseOutputBuffer(outputIndex, false)
                }
            }
            assertTrue("The generated video encoder must finish", finished)
            return replay
        } finally { codec.stop(); codec.release() }
    }

    @Test
    fun replayStartsAtKeyframeAndExportsPlayableRecentVideoWithoutRecordingStop() {
        val replay = generatedReplay()
        val snapshot = replay.snapshot(5, 0)
        assertTrue(snapshot.samples.first { it.video }.flags and MediaCodec.BUFFER_FLAG_KEY_FRAME != 0)
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val output = File(context.cacheDir, "replay-test-${System.nanoTime()}.mp4")
        try {
            val result = JSONObject(snapshot.write(output))
            assertTrue(result.getLong("durationMs") in 3000..5100)
            val extractor = MediaExtractor()
            try {
                extractor.setDataSource(output.absolutePath)
                assertEquals(1, extractor.trackCount)
                extractor.selectTrack(0)
                assertTrue(extractor.sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC != 0)
                var previous = -1L
                while (extractor.sampleTime >= 0) {
                    assertTrue(extractor.sampleTime > previous)
                    previous = extractor.sampleTime
                    extractor.advance()
                }
            } finally { extractor.release() }
            val gallery = GalleryMedia.publish(context, output, "video/mp4")
            assertEquals(gallery, GalleryMedia.publish(context, output, "video/mp4"))
            context.contentResolver.delete(android.net.Uri.parse(gallery), null, null)
            replay.configure(0)
            assertTrue(runCatching { replay.snapshot(5, 0) }.isFailure)
        } finally { output.delete() }
    }
}