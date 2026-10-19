package com.njsstore.livestudio.studio

import android.app.Activity
import android.os.Handler
import android.os.Looper
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/** The foreground activity, needed for overlays (WebView host), orientation lock, permissions-less UI helpers. */
object ActivityHolder {
    @Volatile var activity: Activity? = null
}

object Threads {
    val main = Handler(Looper.getMainLooper())

    /** Runs [block] on the UI thread and waits for it (used by the engine thread for view work). */
    fun <T> onMain(timeoutMs: Long = 4_000, block: () -> T): T {
        if (Looper.myLooper() === Looper.getMainLooper()) return block()
        val result = AtomicReference<Result<T>>()
        val done = CountDownLatch(1)
        main.post {
            result.set(runCatching(block))
            done.countDown()
        }
        if (!done.await(timeoutMs, TimeUnit.MILLISECONDS)) throw StudioException("timeout", "The app did not respond in time")
        return result.get().getOrThrow()
    }
}
