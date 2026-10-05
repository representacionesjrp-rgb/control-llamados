package cl.controlllamados.app

import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import javax.net.ssl.HttpsURLConnection

class ApiException(val status: Int, message: String) : IOException(message)

object Api {
    private fun post(url: String, body: JSONObject, token: String? = null): JSONObject {
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            if (connection is HttpsURLConnection) OldAndroidTls.apply(connection)
            connection.requestMethod = "POST"
            connection.connectTimeout = 15_000
            connection.readTimeout = 30_000
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            if (token != null) connection.setRequestProperty("Authorization", "Bearer $token")
            connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() } ?: ""
            val json = runCatching { JSONObject(text) }.getOrDefault(JSONObject())
            if (status !in 200..299) {
                throw ApiException(status, json.optString("message", "Error del servidor ($status)"))
            }
            return json
        } finally {
            connection.disconnect()
        }
    }

    /** Returns (token, executiveName). */
    fun pair(serverUrl: String, code: String, deviceModel: String): Pair<String, String> {
        val json = post(
            "$serverUrl/api/device/pair",
            JSONObject().put("code", code).put("deviceModel", deviceModel),
        )
        return json.getString("token") to json.getString("executiveName")
    }

    fun uploadCalls(serverUrl: String, token: String, calls: List<CallRecord>) {
        val array = JSONArray()
        calls.forEach { array.put(it.toJson()) }
        post("$serverUrl/api/device/calls", JSONObject().put("calls", array), token)
    }
}
