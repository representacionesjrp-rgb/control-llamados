package cl.controlllamados.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.database.ContentObserver
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.provider.CallLog
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import java.text.DateFormat
import java.util.Date

/**
 * Stays running while the phone is on and sends each call to the server a few seconds after it ends.
 */
class CallSyncService : Service() {
    private lateinit var thread: HandlerThread
    private lateinit var handler: Handler
    private val syncRunnable = Runnable { doSync() }
    private val periodicRunnable = object : Runnable {
        override fun run() {
            doSync()
            handler.postDelayed(this, PERIODIC_MS)
        }
    }
    private val observer by lazy {
        object : ContentObserver(handler) {
            override fun onChange(selfChange: Boolean) {
                // The call log changes several times per call; wait for it to settle.
                handler.removeCallbacks(syncRunnable)
                handler.postDelayed(syncRunnable, DEBOUNCE_MS)
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        thread = HandlerThread("call-sync").apply { start() }
        handler = Handler(thread.looper)
        createChannel(this)
        ServiceCompat.startForeground(
            this,
            NOTIFICATION_ID,
            buildNotification(this),
            if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0,
        )
        runCatching { contentResolver.registerContentObserver(CallLog.Calls.CONTENT_URI, true, observer) }
        handler.post(periodicRunnable)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!Prefs(this).isPaired) {
            stopSelf()
            return START_NOT_STICKY
        }
        handler.post(syncRunnable)
        return START_STICKY
    }

    private fun doSync() {
        Sync.run(this)
        if (!Prefs(this).isPaired) {
            stopSelf()
            return
        }
        getSystemService(NotificationManager::class.java)?.notify(NOTIFICATION_ID, buildNotification(this))
    }

    override fun onDestroy() {
        runCatching { contentResolver.unregisterContentObserver(observer) }
        handler.removeCallbacksAndMessages(null)
        thread.quitSafely()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val CHANNEL_ID = "sync"
        private const val NOTIFICATION_ID = 1
        private const val DEBOUNCE_MS = 4_000L
        private const val PERIODIC_MS = 10 * 60_000L

        fun start(context: Context) {
            if (!Prefs(context).isPaired) return
            runCatching {
                ContextCompat.startForegroundService(context, Intent(context, CallSyncService::class.java))
            }
        }

        private fun createChannel(context: Context) {
            // Channels exist since Android 8; older phones show the notification without one.
            if (Build.VERSION.SDK_INT < 26) return
            val channel = NotificationChannel(CHANNEL_ID, "Sincronizacion", NotificationManager.IMPORTANCE_MIN)
            channel.setShowBadge(false)
            context.getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
        }

        private fun buildNotification(context: Context): Notification {
            val prefs = Prefs(context)
            val text = when {
                prefs.lastError != null -> prefs.lastError!!
                prefs.lastSyncAt > 0 -> "Ultimo envio " + DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(prefs.lastSyncAt))
                else -> "Activo"
            }
            val open = PendingIntent.getActivity(
                context, 0, Intent(context, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE,
            )
            return NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_call)
                .setContentTitle("Control de llamados")
                .setContentText(text)
                .setOngoing(true)
                .setSilent(true)
                .setContentIntent(open)
                .setPriority(NotificationCompat.PRIORITY_MIN)
                .build()
        }
    }
}
