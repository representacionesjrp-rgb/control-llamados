package cl.controlllamados.app

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import androidx.core.content.ContextCompat
import org.json.JSONArray

/**
 * Measures how long each call lasted from dialing (or ringing) to hanging up, because the call log
 * only keeps the talk time. The difference is the time spent waiting for the other side to answer.
 * Needs the "Telefono" permission (READ_PHONE_STATE); without it calls are sent as before, with no wait time.
 */
object CallTimer {
    private const val PREFS = "call_timer"
    private const val KEY = "sessions"
    private const val MAX_SESSIONS = 300
    /** A call log entry is matched to the session that started within this window. */
    private const val MATCH_MS = 10_000L

    private var callStart = 0L
    private var registered: Any? = null

    fun hasPermission(context: Context) =
        ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED

    /** Starts listening to call state changes; call from the main thread. Safe to call repeatedly. */
    fun register(context: Context) {
        if (registered != null || !hasPermission(context)) return
        val app = context.applicationContext
        val telephony = app.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager ?: return
        runCatching {
            if (Build.VERSION.SDK_INT >= 31) {
                val callback = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
                    override fun onCallStateChanged(state: Int) = onState(app, state)
                }
                telephony.registerTelephonyCallback(ContextCompat.getMainExecutor(app), callback)
                registered = callback
            } else {
                @Suppress("DEPRECATION")
                val listener = object : PhoneStateListener() {
                    @Deprecated("Deprecated in Java")
                    override fun onCallStateChanged(state: Int, phoneNumber: String?) = onState(app, state)
                }
                @Suppress("DEPRECATION")
                telephony.listen(listener, PhoneStateListener.LISTEN_CALL_STATE)
                registered = listener
            }
        }
    }

    fun unregister(context: Context) {
        val telephony = context.applicationContext.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
        val current = registered ?: return
        runCatching {
            if (Build.VERSION.SDK_INT >= 31 && current is TelephonyCallback) {
                telephony?.unregisterTelephonyCallback(current)
            } else if (current is PhoneStateListener) {
                @Suppress("DEPRECATION")
                telephony?.listen(current, PhoneStateListener.LISTEN_NONE)
            }
        }
        registered = null
        callStart = 0L
    }

    private fun onState(context: Context, state: Int) {
        val now = System.currentTimeMillis()
        when (state) {
            TelephonyManager.CALL_STATE_RINGING, TelephonyManager.CALL_STATE_OFFHOOK ->
                if (callStart == 0L) callStart = now
            TelephonyManager.CALL_STATE_IDLE -> {
                if (callStart != 0L) save(context, callStart, now)
                callStart = 0L
            }
        }
    }

    @Synchronized
    private fun save(context: Context, start: Long, end: Long) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val sessions = runCatching { JSONArray(prefs.getString(KEY, "[]")) }.getOrDefault(JSONArray())
        sessions.put(JSONArray().put(start).put(end))
        val kept = JSONArray()
        for (i in maxOf(0, sessions.length() - MAX_SESSIONS) until sessions.length()) kept.put(sessions.get(i))
        prefs.edit().putString(KEY, kept.toString()).apply()
    }

    /** Adds the wait time (seconds from dialing/ringing until answered or hung up) to calls it measured. */
    @Synchronized
    fun withWaitTimes(context: Context, calls: List<CallRecord>): List<CallRecord> {
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null) ?: return calls
        val sessions = runCatching {
            val array = JSONArray(raw)
            (0 until array.length()).map { array.getJSONArray(it).let { s -> s.getLong(0) to s.getLong(1) } }
        }.getOrNull() ?: return calls
        if (sessions.isEmpty()) return calls
        return calls.map { call ->
            if (call.type !in setOf("outgoing", "incoming", "missed", "rejected")) return@map call
            val session = sessions
                .filter { kotlin.math.abs(it.first - call.startedAt) <= MATCH_MS }
                .minByOrNull { kotlin.math.abs(it.first - call.startedAt) }
                ?: return@map call
            val totalSec = (session.second - session.first) / 1000
            call.copy(waitSec = (totalSec - call.durationSec).coerceIn(0L, 3600L))
        }
    }
}
