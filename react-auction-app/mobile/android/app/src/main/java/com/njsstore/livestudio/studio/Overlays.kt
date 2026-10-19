package com.njsstore.livestudio.studio

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ImageView
import com.pedro.encoder.input.gl.render.filters.AndroidViewFilterRender
import com.pedro.library.view.GlStreamInterface
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Wrapper the GL thread draws from: WebView/ImageView may only be drawn on the main thread, so a draw requested
 * from another thread is marshalled to main and awaited (bounded, so a busy UI only skips an overlay frame).
 */
class OverlayHost(context: Context) : FrameLayout(context) {
    var opacity = 1f
    private val main = Handler(Looper.getMainLooper())

    override fun draw(canvas: Canvas) {
        val render = {
            val saved = canvas.save()
            try {
                if (opacity < 0.999f) {
                    canvas.saveLayerAlpha(0f, 0f, width.toFloat(), height.toFloat(), (opacity * 255).toInt())
                }
                super.draw(canvas)
            } finally {
                canvas.restoreToCount(saved)
            }
        }
        if (Looper.myLooper() === Looper.getMainLooper()) {
            render()
            return
        }
        val done = CountDownLatch(1)
        val abandoned = AtomicBoolean(false)
        main.post {
            try {
                if (!abandoned.get()) render()
            } finally {
                done.countDown()
            }
        }
        if (!done.await(DRAW_TIMEOUT_MS, TimeUnit.MILLISECONDS)) abandoned.set(true)
    }

    private companion object {
        const val DRAW_TIMEOUT_MS = 800L
    }
}

/** Owns the off-screen WebViews/ImageViews behind the overlay widgets and turns them into GL filters. */
class OverlayManager(private val appContext: Context, private val currentActivity: () -> Activity?) {
    private class Item(val spec: OverlaySpec, val host: OverlayHost, val web: WebView?, val image: ImageView?) {
        var reload: Runnable? = null
        var parkedUntil = 0L
    }

    private val main = Handler(Looper.getMainLooper())
    private val loader = Executors.newSingleThreadExecutor { Thread(it, "overlay-image") }
    private val live = LinkedHashMap<String, Item>()
    private val parked = HashMap<String, Item>()
    private var frameWidth = 1920
    private var frameHeight = 1080
    private var fps = 15
    private var hardware = false
    private val debuggable = (appContext.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0

    // All methods below must run on the main thread.

    fun configure(frameWidth: Int, frameHeight: Int, fps: Int, hardware: Boolean) {
        this.frameWidth = frameWidth
        this.frameHeight = frameHeight
        this.fps = fps
        this.hardware = hardware
    }

    fun setSpecs(specs: List<OverlaySpec>) {
        val wanted = specs.associateBy { it.id }
        for (id in live.keys.toList()) {
            val item = live[id] ?: continue
            if (wanted[id] != item.spec) {
                live.remove(id)
                park(item)
            }
        }
        for (spec in specs) {
            if (live.containsKey(spec.id)) continue
            val revived = parked[spec.id]?.takeIf { it.spec == spec }
            if (revived != null) {
                parked.remove(spec.id)
                revived.parkedUntil = 0
                live[spec.id] = revived
            } else {
                parked.remove(spec.id)?.let { destroy(it) }
                create(spec)?.let { live[spec.id] = it }
            }
        }
    }

    /** Recreates the GL filters for the enabled widgets. Safe to call repeatedly: the previous filters are cleared first. */
    fun bind(gl: GlStreamInterface) {
        gl.clearFilters()
        for (item in live.values) {
            val spec = item.spec
            if (!spec.enabled) continue
            item.host.opacity = spec.opacity
            var scaleX = spec.widthPct
            var scaleY = scaleX * spec.pageHeight / spec.pageWidth * frameWidth / frameHeight
            if (scaleY > 100f) {
                scaleX *= 100f / scaleY
                scaleY = 100f
            }
            val filter = AndroidViewFilterRender()
            filter.isHardwareMode = hardware
            filter.targetFps = fps
            val layoutHost = {
                item.host.measure(
                    View.MeasureSpec.makeMeasureSpec(spec.pageWidth, View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(spec.pageHeight, View.MeasureSpec.EXACTLY),
                )
                item.host.layout(0, 0, spec.pageWidth, spec.pageHeight)
            }
            layoutHost()
            filter.view = item.host
            // The filter measures the view with UNSPECIFIED; restore the exact page size it is drawn at.
            layoutHost()
            filter.setScale(scaleX, scaleY)
            val (x, y) = position(spec.anchor, scaleX, scaleY)
            filter.setPosition(x, y)
            gl.addFilter(filter)
        }
    }

    fun clear(gl: GlStreamInterface) = gl.clearFilters()

    fun reloadAll() {
        live.values.forEach { item ->
            item.web?.reload()
            item.image?.let { loadImage(item) }
        }
    }

    fun destroyAll() {
        (live.values + parked.values).toList().forEach { destroy(it) }
        live.clear()
        parked.clear()
    }

    private fun position(anchor: String, scaleX: Float, scaleY: Float): Pair<Float, Float> {
        val marginX = 2f
        val marginY = 3f
        val centerX = (100f - scaleX) / 2f
        val centerY = (100f - scaleY) / 2f
        return when (anchor) {
            "top-left" -> marginX to marginY
            "top-center" -> centerX to marginY
            "top-right" -> (100f - scaleX - marginX) to marginY
            "bottom-left" -> marginX to (100f - scaleY - marginY)
            "bottom-center" -> centerX to (100f - scaleY - marginY)
            "bottom-right" -> (100f - scaleX - marginX) to (100f - scaleY - marginY)
            else -> centerX to centerY
        }.let { (x, y) -> x.coerceAtLeast(0f) to y.coerceAtLeast(0f) }
    }

    // ── View lifecycle ───────────────────────────────────────────────────────

    private fun park(item: Item) {
        parked.remove(item.spec.id)?.let { destroy(it) }
        item.parkedUntil = System.currentTimeMillis() + PARK_MS
        parked[item.spec.id] = item
        main.postDelayed({
            if (parked[item.spec.id] === item && item.parkedUntil <= System.currentTimeMillis()) {
                parked.remove(item.spec.id)
                destroy(item)
            }
        }, PARK_MS + 500)
    }

    private fun attach(host: OverlayHost, spec: OverlaySpec): Boolean {
        val activity = currentActivity() ?: return false
        val root = activity.window?.decorView as? ViewGroup ?: return false
        host.layoutParams = FrameLayout.LayoutParams(spec.pageWidth, spec.pageHeight, Gravity.TOP or Gravity.START)
        // Visible (so the WebView keeps rendering) but far outside the screen.
        host.translationX = -(spec.pageWidth + 64f)
        root.addView(host)
        return true
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun create(spec: OverlaySpec): Item? {
        val host = OverlayHost(appContext).apply { opacity = spec.opacity }
        if (!attach(host, spec)) return null
        return if (spec.kind == "image") {
            val image = ImageView(appContext).apply { scaleType = ImageView.ScaleType.FIT_CENTER }
            host.addView(image, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            Item(spec, host, null, image).also { loadImage(it) }
        } else {
            val web = WebView(currentActivity() ?: appContext).apply {
                setBackgroundColor(Color.TRANSPARENT)
                isVerticalScrollBarEnabled = false
                isHorizontalScrollBarEnabled = false
                overScrollMode = View.OVER_SCROLL_NEVER
                settings.apply {
                    javaScriptEnabled = true
                    domStorageEnabled = true
                    mediaPlaybackRequiresUserGesture = false
                    useWideViewPort = true
                    loadWithOverviewMode = true
                    setSupportZoom(false)
                    builtInZoomControls = false
                    allowFileAccess = false
                    allowContentAccess = false
                    mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                    userAgentString = "$userAgentString NJSLiveStudio/overlay"
                }
            }
            val item = Item(spec, host, web, null)
            web.webViewClient = clientFor(item)
            host.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            if (debuggable) WebView.setWebContentsDebuggingEnabled(true)
            web.loadUrl(spec.url)
            item
        }
    }

    private fun clientFor(item: Item) = object : WebViewClient() {
        private val origin = runCatching { URL(item.spec.url).host }.getOrNull()

        private fun fitViewport(view: WebView) {
            // Lay the page out at its design width (e.g. 1920 CSS px) regardless of the phone's pixel density.
            val script = "(function(){var m=document.querySelector('meta[name=viewport]');" +
                "if(!m){m=document.createElement('meta');m.name='viewport';document.head.appendChild(m);}" +
                "m.setAttribute('content','width=${item.spec.pageWidth}, initial-scale=1');})();"
            view.evaluateJavascript(script, null)
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) = fitViewport(view)
        override fun onPageCommitVisible(view: WebView, url: String?) = fitViewport(view)
        override fun onPageFinished(view: WebView, url: String?) = fitViewport(view)

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
            request.isForMainFrame && request.url.host != origin

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) return
            item.reload?.let { main.removeCallbacks(it) }
            val retry = Runnable { if (live[item.spec.id] === item || parked[item.spec.id] === item) view.reload() }
            item.reload = retry
            main.postDelayed(retry, RELOAD_MS)
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            main.post {
                if (live[item.spec.id] === item) {
                    live.remove(item.spec.id)
                    destroy(item)
                    create(item.spec)?.let { live[item.spec.id] = it }
                }
            }
            return true
        }
    }

    private fun loadImage(item: Item) {
        val image = item.image ?: return
        val url = item.spec.url
        loader.execute {
            val bitmap = runCatching { download(url) }.getOrNull()
            main.post {
                if (live[item.spec.id] !== item && parked[item.spec.id] !== item) return@post
                if (bitmap != null) {
                    image.setImageBitmap(bitmap)
                } else {
                    item.reload?.let { main.removeCallbacks(it) }
                    val retry = Runnable { if (live[item.spec.id] === item) loadImage(item) }
                    item.reload = retry
                    main.postDelayed(retry, IMAGE_RETRY_MS)
                }
            }
        }
    }

    private fun download(url: String): Bitmap? {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.connectTimeout = 8_000
        connection.readTimeout = 8_000
        connection.instanceFollowRedirects = true
        return try {
            if (connection.responseCode !in 200..299) return null
            val bytes = connection.inputStream.use { stream ->
                val buffer = java.io.ByteArrayOutputStream()
                val chunk = ByteArray(16 * 1024)
                var total = 0
                while (true) {
                    val read = stream.read(chunk)
                    if (read < 0) break
                    total += read
                    if (total > MAX_IMAGE_BYTES) return null
                    buffer.write(chunk, 0, read)
                }
                buffer.toByteArray()
            }
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
            var sample = 1
            while (bounds.outWidth / sample > 2048 || bounds.outHeight / sample > 2048) sample *= 2
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
        } finally {
            connection.disconnect()
        }
    }

    private fun destroy(item: Item) {
        item.reload?.let { main.removeCallbacks(it) }
        item.reload = null
        (item.host.parent as? ViewGroup)?.removeView(item.host)
        item.web?.apply {
            stopLoading()
            loadUrl("about:blank")
            (parent as? ViewGroup)?.removeView(this)
            destroy()
        }
        item.image?.setImageDrawable(null)
    }

    private companion object {
        const val PARK_MS = 90_000L
        const val RELOAD_MS = 5_000L
        const val IMAGE_RETRY_MS = 15_000L
        const val MAX_IMAGE_BYTES = 10 * 1024 * 1024
    }
}
