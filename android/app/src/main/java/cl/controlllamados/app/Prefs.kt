package cl.controlllamados.app

import android.content.Context
import android.content.SharedPreferences

class Prefs(context: Context) {
    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences("control_llamados", Context.MODE_PRIVATE)

    var serverUrl: String
        get() = prefs.getString("server_url", null) ?: BuildConfig.DEFAULT_SERVER_URL
        set(value) = prefs.edit().putString("server_url", value.trim().trimEnd('/')).apply()

    var token: String?
        get() = prefs.getString("token", null)
        set(value) = prefs.edit().putString("token", value).apply()

    var executiveName: String?
        get() = prefs.getString("executive_name", null)
        set(value) = prefs.edit().putString("executive_name", value).apply()

    /** Start time (ms) of the newest call already accepted by the server. */
    var lastCallDate: Long
        get() = prefs.getLong("last_call_date", 0L)
        set(value) = prefs.edit().putLong("last_call_date", value).apply()

    var lastSyncAt: Long
        get() = prefs.getLong("last_sync_at", 0L)
        set(value) = prefs.edit().putLong("last_sync_at", value).apply()

    var lastError: String?
        get() = prefs.getString("last_error", null)
        set(value) = prefs.edit().putString("last_error", value).apply()

    val isPaired: Boolean get() = !token.isNullOrBlank()

    fun unpair() {
        prefs.edit().remove("token").remove("executive_name").remove("last_call_date").apply()
    }
}
