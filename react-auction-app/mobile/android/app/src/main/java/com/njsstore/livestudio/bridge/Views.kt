package com.njsstore.livestudio.bridge

import android.annotation.SuppressLint
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.view.MotionEvent
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.widget.FrameLayout
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.rtsp.RtspMediaSource
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.njsstore.livestudio.studio.Engine
import com.njsstore.livestudio.studio.PeerMedia

/** The encoder's own GL output (overlays included): what you see is what is streamed. */
class StudioPreviewView(context: Context) : SurfaceView(context), SurfaceHolder.Callback {
    init {
        holder.addCallback(this)
    }

    override fun surfaceCreated(holder: SurfaceHolder) = Unit

    override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
        Engine.onPreviewSurface(holder.surface, width, height)
    }

    override fun surfaceDestroyed(holder: SurfaceHolder) {
        Engine.detachPreviewBlocking()
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        val camera = Engine.gestureCamera() ?: return false
        return when {
            event.pointerCount >= 2 -> {
                if (event.actionMasked == MotionEvent.ACTION_MOVE) runCatching { camera.setZoom(event) }
                true
            }
            event.actionMasked == MotionEvent.ACTION_DOWN -> {
                runCatching { camera.tapToFocus(this, event) }
                true
            }
            else -> false
        }
    }
}

class StudioPreviewManager : SimpleViewManager<StudioPreviewView>() {
    override fun getName() = "NjsStudioPreview"

    override fun createViewInstance(context: ThemedReactContext) = StudioPreviewView(context)
}

/** Low-latency, hardware-decoded thumbnail of another phone's RTSP camera. */
@OptIn(UnstableApi::class)
class PeerPreviewView(context: Context) : FrameLayout(context) {
    private val surface = SurfaceView(context)
    private val main = Handler(Looper.getMainLooper())
    private var player: ExoPlayer? = null
    private var retry: Runnable? = null
    var url: String? = null
    var active = true
    var muted = true

    init {
        addView(surface, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    }

    fun refresh() {
        stop()
        val address = url
        if (!active || address.isNullOrBlank() || !PeerMedia.valid(address)) return
        val exo = ExoPlayer.Builder(context)
            .setLoadControl(DefaultLoadControl.Builder().setBufferDurationsMs(300, 1000, 150, 300).build())
            .build()
        exo.trackSelectionParameters = exo.trackSelectionParameters.buildUpon()
            .setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, muted)
            .build()
        exo.volume = if (muted) 0f else 1f
        exo.setVideoSurfaceView(surface)
        exo.addListener(object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) = scheduleRetry()
        })
        exo.setMediaSource(
            PeerMedia.source(address),
        )
        exo.prepare()
        exo.playWhenReady = true
        player = exo
    }

    private fun scheduleRetry() {
        val task = Runnable { refresh() }
        retry = task
        main.postDelayed(task, 5_000)
    }

    fun stop() {
        retry?.let { main.removeCallbacks(it) }
        retry = null
        player?.release()
        player = null
    }

    override fun onDetachedFromWindow() {
        stop()
        super.onDetachedFromWindow()
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        if (player == null) refresh()
    }
}

class PeerPreviewManager : SimpleViewManager<PeerPreviewView>() {
    override fun getName() = "NjsPeerPreview"

    override fun createViewInstance(context: ThemedReactContext) = PeerPreviewView(context)

    @ReactProp(name = "url")
    fun setUrl(view: PeerPreviewView, url: String?) { view.url = url }

    @ReactProp(name = "active", defaultBoolean = true)
    fun setActive(view: PeerPreviewView, active: Boolean) { view.active = active }

    @ReactProp(name = "muted", defaultBoolean = true)
    fun setMuted(view: PeerPreviewView, muted: Boolean) { view.muted = muted }

    override fun onAfterUpdateTransaction(view: PeerPreviewView) {
        super.onAfterUpdateTransaction(view)
        view.refresh()
    }

    override fun onDropViewInstance(view: PeerPreviewView) {
        view.stop()
        super.onDropViewInstance(view)
    }
}
