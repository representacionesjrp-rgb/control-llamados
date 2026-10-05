package cl.controlllamados.app

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
import androidx.core.content.ContextCompat

object Sync {
    private const val TAG = "ControlLlamados"
    private const val BATCH = 500
    /** History sent once after pairing (or after updating from a version that sent less). */
    private const val HISTORY_DAYS = 120
    /** Re-send a window so a long call (logged when it ends, dated when it started) is never skipped. */
    private const val OVERLAP_MS = 3 * 3600_000L

    sealed class Result {
        data class Ok(val sent: Int) : Result()
        data class Failed(val message: String) : Result()
    }

    @Synchronized
    fun run(context: Context): Result {
        val prefs = Prefs(context)
        val token = prefs.token ?: return Result.Failed("Telefono sin vincular")
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) {
            prefs.lastError = "Falta el permiso de registro de llamadas"
            return Result.Failed(prefs.lastError!!)
        }
        val needsHistory = prefs.historyDaysSent < HISTORY_DAYS
        val since = if (prefs.lastCallDate == 0L || needsHistory) {
            System.currentTimeMillis() - HISTORY_DAYS * 24 * 3600_000L
        } else {
            prefs.lastCallDate - OVERLAP_MS
        }
        return try {
            val calls = CallTimer.withWaitTimes(context, CallLogReader.readSince(context, since))
            for (chunk in calls.chunked(BATCH)) {
                Api.uploadCalls(prefs.serverUrl, token, chunk)
                prefs.lastCallDate = maxOf(prefs.lastCallDate, chunk.maxOf { it.startedAt })
            }
            if (calls.isEmpty()) {
                // Still report in so the dashboard shows the phone is alive.
                Api.uploadCalls(prefs.serverUrl, token, emptyList())
            }
            if (needsHistory) prefs.historyDaysSent = HISTORY_DAYS
            prefs.lastSyncAt = System.currentTimeMillis()
            prefs.lastError = null
            Result.Ok(calls.size)
        } catch (e: ApiException) {
            if (e.status == 401) prefs.unpair()
            prefs.lastError = e.message
            Log.w(TAG, "Sync failed", e)
            Result.Failed(e.message ?: "Error")
        } catch (e: Exception) {
            prefs.lastError = "Sin conexion: ${e.message}"
            Log.w(TAG, "Sync failed", e)
            Result.Failed(prefs.lastError!!)
        }
    }
}
