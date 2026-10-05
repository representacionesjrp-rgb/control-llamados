package cl.controlllamados.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.text.InputFilter
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.ContextCompat
import java.text.DateFormat
import java.util.Date
import java.util.concurrent.Executors

class MainActivity : Activity() {
    private val io = Executors.newSingleThreadExecutor()
    private lateinit var prefs: Prefs
    private lateinit var root: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(48), dp(24), dp(24))
        }
        setContentView(ScrollView(this).apply { addView(root) })
    }

    override fun onResume() {
        super.onResume()
        render()
        if (prefs.isPaired) {
            SyncWorker.schedule(this)
            if (hasCallLogPermission()) CallSyncService.start(this)
        }
    }

    override fun onDestroy() {
        io.shutdown()
        super.onDestroy()
    }

    private fun render() {
        root.removeAllViews()
        heading("Control de llamados")
        if (prefs.isPaired) renderPaired() else renderPairing()
    }

    private fun renderPairing() {
        text("Ingresa el codigo de 6 letras que te entrego tu jefatura. Se hace una sola vez.")
        val serverInput = EditText(this).apply {
            hint = "Direccion del servidor (https://...)"
            setText(prefs.serverUrl)
            inputType = InputType.TYPE_TEXT_VARIATION_URI
            visibility = if (BuildConfig.DEFAULT_SERVER_URL.isBlank()) View.VISIBLE else View.GONE
        }
        root.addView(serverInput)
        val codeInput = EditText(this).apply {
            hint = "Codigo"
            textSize = 28f
            gravity = Gravity.CENTER
            typeface = Typeface.MONOSPACE
            filters = arrayOf(InputFilter.AllCaps(), InputFilter.LengthFilter(6))
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
        }
        root.addView(codeInput, matchWidth(top = 16))
        val status = text("")
        button("Vincular este telefono") { btn ->
            val server = serverInput.text.toString().trim().trimEnd('/')
            val code = codeInput.text.toString().trim()
            if (!server.startsWith("https://") && !server.startsWith("http://")) {
                status.text = "Revisa la direccion del servidor."
                return@button
            }
            if (code.length != 6) {
                status.text = "El codigo tiene 6 letras."
                return@button
            }
            btn.isEnabled = false
            status.text = "Vinculando..."
            io.execute {
                val result = runCatching { Api.pair(server, code, "${Build.MANUFACTURER} ${Build.MODEL}") }
                runOnUiThread {
                    btn.isEnabled = true
                    result.onSuccess { (token, name) ->
                        prefs.serverUrl = server
                        prefs.token = token
                        prefs.executiveName = name
                        prefs.lastCallDate = 0L
                        prefs.historyDaysSent = 0
                        prefs.lastError = null
                        render()
                        requestPermissionsIfNeeded()
                    }.onFailure { status.text = it.message ?: "No se pudo conectar." }
                }
            }
        }
    }

    private fun renderPaired() {
        text("Telefono de ${prefs.executiveName}", size = 18f, bold = true)
        val permissionOk = hasCallLogPermission()
        val batteryOk = isIgnoringBatteryOptimizations()
        checkRow(permissionOk, "Acceso al registro de llamadas")
        checkRow(batteryOk, "Funciona en segundo plano")
        val phoneOk = CallTimer.hasPermission(this)
        checkRow(phoneOk, "Mide el tiempo de espera")
        if (!permissionOk) button("Dar permiso de llamadas") { requestPermissionsIfNeeded() }
        else if (!phoneOk) button("Dar permiso de telefono") { requestPermissionsIfNeeded() }
        if (!batteryOk) button("Permitir segundo plano") { requestBatteryExemption() }

        val last = if (prefs.lastSyncAt > 0) {
            DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(prefs.lastSyncAt))
        } else "todavia no"
        text("Ultimo envio: $last", top = 20)
        prefs.lastError?.let { text(it, color = Color.rgb(194, 53, 43)) }
        text("Las llamadas se envian automaticamente al terminar cada una. No necesitas abrir la app.", color = Color.GRAY)

        button("Enviar ahora") { btn ->
            btn.isEnabled = false
            io.execute {
                val result = Sync.run(this)
                runOnUiThread {
                    btn.isEnabled = true
                    val message = when (result) {
                        is Sync.Result.Ok -> "Listo: ${result.sent} llamadas revisadas"
                        is Sync.Result.Failed -> result.message
                    }
                    Toast.makeText(this, message, Toast.LENGTH_LONG).show()
                    render()
                }
            }
        }
    }

    // ---------- permissions ----------

    private fun hasCallLogPermission() =
        ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED

    private fun requestPermissionsIfNeeded() {
        val needed = mutableListOf<String>()
        if (!hasCallLogPermission()) needed += Manifest.permission.READ_CALL_LOG
        if (!CallTimer.hasPermission(this)) needed += Manifest.permission.READ_PHONE_STATE
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) needed += Manifest.permission.POST_NOTIFICATIONS
        if (needed.isNotEmpty()) {
            requestPermissions(needed.toTypedArray(), REQUEST_PERMISSIONS)
        } else if (!isIgnoringBatteryOptimizations()) {
            requestBatteryExemption()
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != REQUEST_PERMISSIONS) return
        if (hasCallLogPermission()) {
            SyncWorker.schedule(this)
            CallSyncService.start(this)
            if (!isIgnoringBatteryOptimizations()) requestBatteryExemption()
        } else if (!shouldShowRequestPermissionRationale(Manifest.permission.READ_CALL_LOG)) {
            // Permanently denied: send the user to the app's settings page.
            Toast.makeText(this, "Activa el permiso Registro de llamadas en Permisos", Toast.LENGTH_LONG).show()
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null)))
        }
        render()
    }

    private fun isIgnoringBatteryOptimizations(): Boolean =
        getSystemService(PowerManager::class.java)?.isIgnoringBatteryOptimizations(packageName) == true

    @SuppressLint("BatteryLife")
    private fun requestBatteryExemption() {
        runCatching {
            startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
        }.onFailure {
            startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        }
    }

    // ---------- tiny view helpers ----------

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    private fun matchWidth(top: Int = 8) = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT,
    ).apply { topMargin = dp(top) }

    private fun heading(value: String) = text(value, size = 26f, bold = true, color = Color.rgb(15, 107, 92), top = 0)

    private fun text(value: String, size: Float = 16f, bold: Boolean = false, color: Int = Color.rgb(23, 32, 29), top: Int = 12): TextView {
        val view = TextView(this).apply {
            text = value
            textSize = size
            setTextColor(color)
            if (bold) setTypeface(typeface, Typeface.BOLD)
        }
        root.addView(view, matchWidth(top))
        return view
    }

    private fun checkRow(ok: Boolean, label: String) =
        text((if (ok) "✓ " else "✗ ") + label, color = if (ok) Color.rgb(29, 138, 78) else Color.rgb(194, 53, 43), top = 8)

    private fun button(label: String, onClick: (Button) -> Unit): Button {
        val view = Button(this).apply {
            text = label
            setOnClickListener { onClick(this) }
        }
        root.addView(view, matchWidth(top = 16))
        return view
    }

    companion object {
        private const val REQUEST_PERMISSIONS = 10
    }
}
