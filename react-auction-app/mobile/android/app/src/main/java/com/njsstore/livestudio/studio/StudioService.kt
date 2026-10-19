package com.njsstore.livestudio.studio

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.njsstore.livestudio.MainActivity
import com.njsstore.livestudio.R

/** Keeps the process, camera and microphone alive while streaming or serving a LAN camera with the screen off. */
class StudioService : Service() {
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        val title = intent?.getStringExtra(EXTRA_TITLE) ?: getString(R.string.app_name)
        val text = intent?.getStringExtra(EXTRA_TEXT) ?: ""
        val notification = buildNotification(title, text)
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                val type = ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                startForeground(NOTIFICATION_ID, notification, type)
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        } catch (_: Exception) {
            // The OS refused a foreground start (e.g. started from the background); streaming continues while the app is visible.
            stopSelf()
            return START_NOT_STICKY
        }
        if (wakeLock == null) {
            val power = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "NJSLiveStudio:stream").apply {
                setReferenceCounted(false)
                acquire(MAX_WAKE_MS)
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null
        super.onDestroy()
    }

    private fun buildNotification(title: String, text: String): Notification {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= 26 && manager.getNotificationChannel(CHANNEL_ID) == null) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Live streaming", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "Shown while NJS Live Studio is streaming or serving a camera"
                    setShowBadge(false)
                },
            )
        }
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(android.R.drawable.presence_video_online)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(open)
            .build()
    }

    companion object {
        private const val CHANNEL_ID = "njs_live_stream"
        private const val NOTIFICATION_ID = 4711
        private const val ACTION_STOP = "com.njsstore.livestudio.STOP"
        private const val EXTRA_TITLE = "title"
        private const val EXTRA_TEXT = "text"
        private const val MAX_WAKE_MS = 12 * 60 * 60 * 1000L

        fun start(context: Context, title: String, text: String): Boolean = try {
            ContextCompat.startForegroundService(
                context,
                Intent(context, StudioService::class.java).putExtra(EXTRA_TITLE, title).putExtra(EXTRA_TEXT, text),
            )
            true
        } catch (_: Exception) {
            false
        }

        fun stop(context: Context) {
            runCatching { context.startService(Intent(context, StudioService::class.java).setAction(ACTION_STOP)) }
            runCatching { context.stopService(Intent(context, StudioService::class.java)) }
        }
    }
}
