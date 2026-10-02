package cl.controlllamados.app

import android.content.Context
import android.provider.CallLog
import org.json.JSONObject

data class CallRecord(
    val id: Long,
    val number: String,
    val name: String?,
    val type: String,
    val startedAt: Long,
    val durationSec: Long,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("deviceCallId", id.toString())
        .put("number", number)
        .put("contactName", name ?: JSONObject.NULL)
        .put("type", type)
        .put("startedAt", startedAt)
        .put("durationSec", durationSec)
}

object CallLogReader {
    /** Calls that started at or after [sinceMs], oldest first. */
    fun readSince(context: Context, sinceMs: Long): List<CallRecord> {
        val projection = arrayOf(
            CallLog.Calls._ID,
            CallLog.Calls.NUMBER,
            CallLog.Calls.CACHED_NAME,
            CallLog.Calls.TYPE,
            CallLog.Calls.DATE,
            CallLog.Calls.DURATION,
        )
        val result = ArrayList<CallRecord>()
        context.contentResolver.query(
            CallLog.Calls.CONTENT_URI,
            projection,
            "${CallLog.Calls.DATE} >= ?",
            arrayOf(sinceMs.toString()),
            "${CallLog.Calls.DATE} ASC",
        )?.use { c ->
            val iId = c.getColumnIndexOrThrow(CallLog.Calls._ID)
            val iNumber = c.getColumnIndexOrThrow(CallLog.Calls.NUMBER)
            val iName = c.getColumnIndexOrThrow(CallLog.Calls.CACHED_NAME)
            val iType = c.getColumnIndexOrThrow(CallLog.Calls.TYPE)
            val iDate = c.getColumnIndexOrThrow(CallLog.Calls.DATE)
            val iDuration = c.getColumnIndexOrThrow(CallLog.Calls.DURATION)
            while (c.moveToNext()) {
                result.add(
                    CallRecord(
                        id = c.getLong(iId),
                        number = c.getString(iNumber) ?: "",
                        name = c.getString(iName)?.takeIf { it.isNotBlank() },
                        type = typeName(c.getInt(iType)),
                        startedAt = c.getLong(iDate),
                        durationSec = c.getLong(iDuration).coerceIn(0L, 86_400L),
                    )
                )
            }
        }
        return result
    }

    private fun typeName(type: Int): String = when (type) {
        CallLog.Calls.OUTGOING_TYPE -> "outgoing"
        CallLog.Calls.INCOMING_TYPE, CallLog.Calls.ANSWERED_EXTERNALLY_TYPE -> "incoming"
        CallLog.Calls.MISSED_TYPE -> "missed"
        CallLog.Calls.REJECTED_TYPE -> "rejected"
        CallLog.Calls.BLOCKED_TYPE -> "blocked"
        CallLog.Calls.VOICEMAIL_TYPE -> "voicemail"
        else -> "other"
    }
}
