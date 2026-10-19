package com.njsstore.livestudio.studio

import android.content.Context
import android.graphics.SurfaceTexture
import android.os.Handler
import android.os.Looper
import android.view.Surface
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.rtsp.RtspMediaSource
import com.pedro.encoder.input.sources.OrientationConfig
import com.pedro.encoder.input.sources.OrientationForced
import com.pedro.encoder.input.sources.video.VideoSource

/** Video source that decodes another phone's RTSP camera into the encoder's GL pipeline (multi-camera "program"). */
@OptIn(UnstableApi::class)
class PeerRtspVideoSource(
    private val context: Context,
    private val url: String,
    private val onFailure: (String) -> Unit,
) : VideoSource() {

    private val main = Handler(Looper.getMainLooper())
    private var player: ExoPlayer? = null
    private var surface: Surface? = null
    @Volatile private var running = false
    private val stallTimeout = Runnable { fail("The camera stopped sending video") }

    override fun create(width: Int, height: Int, fps: Int, rotation: Int): Boolean = true

    override fun start(surfaceTexture: SurfaceTexture) {
        if (running) return
        running = true
        val target = Surface(surfaceTexture)
        surface = target
        main.post { if (running) buildPlayer(target) }
    }

    private fun buildPlayer(target: Surface) {
        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(300, 1000, 150, 300)
            .build()
        val exo = ExoPlayer.Builder(context)
            .setLooper(Looper.getMainLooper())
            .setLoadControl(loadControl)
            .build()
        exo.trackSelectionParameters = exo.trackSelectionParameters.buildUpon()
            .setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, true)
            .build()
        exo.setVideoSurface(target)
        exo.addListener(object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) = fail(error.message ?: "The camera connection failed")
            override fun onPlaybackStateChanged(state: Int) {
                main.removeCallbacks(stallTimeout)
                if (state == Player.STATE_BUFFERING) main.postDelayed(stallTimeout, STALL_MS)
                if (state == Player.STATE_ENDED) fail("The camera ended the stream")
            }
        })
        val source = RtspMediaSource.Factory()
            .setForceUseRtpTcp(true)
            .setTimeoutMs(8_000)
            .createMediaSource(MediaItem.fromUri(url))
        exo.setMediaSource(source)
        exo.prepare()
        exo.playWhenReady = true
        player = exo
    }

    private fun fail(reason: String) {
        if (!running) return
        onFailure(reason)
    }

    override fun stop() {
        running = false
        val current = surface
        surface = null
        val done = java.util.concurrent.CountDownLatch(1)
        main.post {
            main.removeCallbacks(stallTimeout)
            player?.release()
            player = null
            current?.release()
            done.countDown()
        }
        // The encoder clears the SurfaceTexture right after stop(); make sure the decoder is gone first.
        if (Looper.myLooper() != Looper.getMainLooper()) done.await(2, java.util.concurrent.TimeUnit.SECONDS)
    }

    override fun release() = Unit

    override fun isRunning(): Boolean = running

    override fun getOrientationConfig() = OrientationConfig(forced = OrientationForced.LANDSCAPE)

    private companion object {
        const val STALL_MS = 8_000L
    }
}
