"use strict";

const REFRESH_MS = 30_000;
const state = {
  token: load("token"),
  period: load("period") || "today",
  timezone: "America/Santiago",
  view: "dashboard",
  detailId: null,
  lastData: null,
  timer: null
};

function load(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function save(key, value) {
  try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* private mode */ }
}
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function api(method, path, body) {
  const response = await fetch(path, {
    method,
    headers: { "content-type": "application/json", ...(state.token ? { authorization: `Bearer ${state.token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && path !== "/api/login") {
    logout();
    throw new Error(data.message || "Sesión expirada");
  }
  if (!response.ok) throw new Error(data.message || `Error ${response.status}`);
  return data;
}

// ---------- dates (in the business timezone) ----------

function localDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: state.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function periodRange(period) {
  const today = localDate(0);
  if (period === "yesterday") { const y = localDate(-1); return { from: y, to: y }; }
  if (period === "week") return { from: localDate(-6), to: today };
  if (period === "month") return { from: today.slice(0, 8) + "01", to: today };
  return { from: today, to: today };
}
const fmtTime = (ms) => new Date(ms).toLocaleTimeString("es-CL", { timeZone: state.timezone, hour: "2-digit", minute: "2-digit" });
const fmtDateTime = (ms) => new Date(ms).toLocaleString("es-CL", { timeZone: state.timezone, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
function fmtMinutes(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}
function fmtDuration(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
function ago(ms) {
  if (!ms) return "nunca";
  const min = Math.floor((Date.now() - ms) / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return fmtDateTime(ms);
}
function syncClass(ms) {
  if (!ms) return "never";
  return Date.now() - ms < 45 * 60_000 ? "fresh" : "stale";
}

// ---------- rendering ----------

function stat(value, label, cls = "") {
  return `<div class="stat ${cls}"><div class="value">${esc(value)}</div><div class="label">${esc(label)}</div></div>`;
}

function renderDashboard(data) {
  const sum = (k) => data.executives.reduce((a, e) => a + Number(e[k] || 0), 0);
  $("totals").innerHTML =
    stat(sum("outgoing"), "Llamadas realizadas") +
    stat(sum("outgoing_answered"), "Contestadas", "ok") +
    stat(sum("outgoing_unanswered"), "No contestadas", "bad") +
    stat(fmtMinutes(sum("talk_sec")), "Tiempo hablado");

  if (!data.executives.length) {
    $("exec-list").innerHTML = `<div class="empty">Aún no hay ejecutivos.<br>Toca <b>Ejecutivos</b> para agregar el primero.</div>`;
    return;
  }
  $("exec-list").innerHTML = data.executives.map((e) => {
    const total = Number(e.outgoing) || 0;
    const okPct = total ? (e.outgoing_answered / total) * 100 : 0;
    const badPct = total ? (e.outgoing_unanswered / total) * 100 : 0;
    const linked = !e.pair_code;
    const syncLabel = linked ? `Sincronizado ${ago(e.last_sync_at)}` : "Sin vincular";
    return `
      <article class="card" data-id="${e.id}">
        <div class="card-head">
          <strong>${esc(e.name)}</strong>
          <span class="sync ${linked ? syncClass(e.last_sync_at) : "never"}">${esc(syncLabel)}</span>
        </div>
        <div class="mini">
          <div><b>${e.outgoing}</b><span>Realizadas</span></div>
          <div class="ok"><b>${e.outgoing_answered}</b><span>Contestadas</span></div>
          <div class="bad"><b>${e.outgoing_unanswered}</b><span>No contest.</span></div>
          <div><b>${Math.round(e.talk_sec / 60)}</b><span>Minutos</span></div>
        </div>
        <div class="bar"><i class="ok" style="width:${okPct}%"></i><i class="bad" style="width:${badPct}%"></i></div>
        <div class="card-foot">
          ${e.incoming} recibidas · ${e.missed} perdidas · ${e.distinct_numbers} números distintos
          ${e.last_call_at ? ` · última ${state.period === "today" ? fmtTime(e.last_call_at) : fmtDateTime(e.last_call_at)}` : ""}
        </div>
      </article>`;
  }).join("");
}

function callKind(c) {
  if (c.type === "outgoing") return c.duration_sec > 0 ? ["t-out", "↗", "Realizada"] : ["t-noans", "↗", "No contestada"];
  if (c.type === "incoming") return ["t-in", "↙", "Recibida"];
  if (c.type === "missed") return ["t-missed", "↙", "Perdida"];
  if (c.type === "rejected") return ["t-missed", "⊘", "Rechazada"];
  return ["", "•", c.type];
}

function renderDetail(data) {
  const calls = data.calls;
  const out = calls.filter((c) => c.type === "outgoing");
  const answered = out.filter((c) => c.duration_sec > 0);
  const talk = calls.reduce((a, c) => a + c.duration_sec, 0);
  $("detail-name").textContent = data.executive.name;
  $("detail-meta").textContent = `${data.executive.device_model || "Teléfono"} · sincronizado ${ago(data.executive.last_sync_at)}`;
  $("detail-totals").innerHTML =
    stat(out.length, "Realizadas") +
    stat(answered.length, "Contestadas", "ok") +
    stat(out.length - answered.length, "No contestadas", "bad") +
    stat(fmtMinutes(talk), "Tiempo hablado") +
    stat(calls.filter((c) => c.type === "incoming").length, "Recibidas", "in") +
    stat(calls.filter((c) => c.type === "missed" || c.type === "rejected").length, "Perdidas", "bad") +
    stat(answered.length ? fmtDuration(Math.round(answered.reduce((a, c) => a + c.duration_sec, 0) / answered.length)) : "–", "Duración promedio") +
    stat(out.length ? `${Math.round((answered.length / out.length) * 100)}%` : "–", "Tasa de contacto");

  const byHour = new Array(24).fill(0);
  const hourFmt = new Intl.DateTimeFormat("en-US", { timeZone: state.timezone, hour: "numeric", hourCycle: "h23" });
  for (const c of out) byHour[Number(hourFmt.format(new Date(c.started_at)))]++;
  const first = Math.min(8, ...byHour.map((n, h) => (n ? h : 24)));
  const last = Math.max(19, ...byHour.map((n, h) => (n ? h : 0)));
  const max = Math.max(1, ...byHour);
  let bars = "";
  for (let h = first; h <= last; h++) {
    bars += `<div class="h" title="${h}:00 · ${byHour[h]} llamadas"><i style="height:${(byHour[h] / max) * 100}%"></i><small>${h % 2 === 0 ? h : ""}</small></div>`;
  }
  $("detail-hours").innerHTML = bars;

  const multiDay = data.from !== data.to;
  $("detail-calls").innerHTML = calls.length
    ? calls.map((c) => {
        const [cls, icon, label] = callKind(c);
        const who = c.contact_name || c.number || "Número privado";
        return `<li class="${cls}"><span class="icon">${icon}</span>
          <span class="who"><b>${esc(who)}</b><span>${esc(label)} · ${multiDay ? fmtDateTime(c.started_at) : fmtTime(c.started_at)}${c.contact_name ? " · " + esc(c.number) : ""}</span></span>
          <span class="dur">${c.duration_sec ? fmtDuration(c.duration_sec) : "–"}</span></li>`;
      }).join("")
    : `<li class="empty" style="display:block">Sin llamadas en este período.</li>`;
}

const installUrl = () => `${location.origin}/instalar/`;

function whatsappLink(e) {
  const text = `Hola ${e.name}, instala la app Control de llamados en tu teléfono desde este link: ${installUrl()}\n\nAl abrirla escribe este código: ${e.pair_code}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

async function renderManage() {
  $("install-link").textContent = installUrl();
  const { executives } = await api("GET", "/api/admin/executives");
  $("manage-list").innerHTML = executives.map((e) => `
    <li data-id="${e.id}">
      <div class="row"><strong>${esc(e.name)}</strong>
        ${e.pair_code ? `<span class="code">${esc(e.pair_code)}</span>` : `<span class="muted">${esc(e.device_model || "Vinculado")}</span>`}
      </div>
      <div class="muted">${e.pair_code ? "Ingresa este código en la app Android del ejecutivo." : `Último envío ${ago(e.last_sync_at)}`}</div>
      <div class="actions">
        ${e.pair_code ? `<a class="ghost-link" href="${whatsappLink(e)}" target="_blank" rel="noopener">Enviar por WhatsApp</a>` : ""}
        <button class="ghost" data-action="code">${e.pair_code ? "Nuevo código" : "Cambiar teléfono"}</button>
        <button class="ghost danger" data-action="delete">Eliminar</button>
      </div>
    </li>`).join("") || `<li class="empty">Agrega tu primer ejecutivo.</li>`;
}

// ---------- flow ----------

function show(view) {
  state.view = view;
  for (const id of ["dashboard", "detail", "manage"]) $(id).hidden = id !== view;
  $("periods").hidden = view === "manage";
  $("tab-manage").hidden = view === "manage";
  $("view-title").textContent = view === "manage" ? "Configuración" : "Llamadas";
  window.scrollTo(0, 0);
}

async function refresh() {
  if (!state.token) return;
  const { from, to } = periodRange(state.period);
  try {
    if (state.view === "detail" && state.detailId) {
      renderDetail(await api("GET", `/api/admin/executives/${state.detailId}/calls?from=${from}&to=${to}`));
    } else if (state.view === "manage") {
      await renderManage();
    } else {
      const data = await api("GET", `/api/admin/summary?from=${from}&to=${to}`);
      state.timezone = data.timezone || state.timezone;
      renderDashboard(data);
    }
    $("updated").textContent = `Actualizado ${new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · se actualiza solo cada 30 s`;
  } catch (error) {
    $("updated").textContent = `Sin conexión: ${error.message}`;
  }
}

function startTimer() {
  clearInterval(state.timer);
  state.timer = setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS);
}

function enterApp() {
  $("login").hidden = true;
  $("app").hidden = false;
  for (const b of $("periods").querySelectorAll("button")) b.classList.toggle("active", b.dataset.period === state.period);
  show("dashboard");
  refresh();
  startTimer();
}

function logout() {
  state.token = null;
  save("token", null);
  clearInterval(state.timer);
  $("app").hidden = true;
  $("login").hidden = false;
}

$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("login-error").textContent = "";
  try {
    const { token } = await api("POST", "/api/login", { password: $("password").value });
    state.token = token;
    save("token", token);
    $("password").value = "";
    enterApp();
  } catch (error) {
    $("login-error").textContent = error.message;
  }
});

$("periods").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-period]");
  if (!button) return;
  state.period = button.dataset.period;
  save("period", state.period);
  for (const b of $("periods").querySelectorAll("button")) b.classList.toggle("active", b === button);
  refresh();
});

$("exec-list").addEventListener("click", (event) => {
  const card = event.target.closest(".card");
  if (!card) return;
  state.detailId = card.dataset.id;
  $("detail-calls").innerHTML = "";
  show("detail");
  refresh();
});

$("detail-back").addEventListener("click", () => { show("dashboard"); refresh(); });
$("manage-back").addEventListener("click", () => { show("dashboard"); refresh(); });
$("tab-manage").addEventListener("click", () => { show("manage"); refresh(); });
$("logout").addEventListener("click", logout);

$("add-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("POST", "/api/admin/executives", { name: $("new-name").value });
    $("new-name").value = "";
    await renderManage();
  } catch (error) {
    alert(error.message);
  }
});

$("manage-list").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const item = button.closest("li");
  const name = item.querySelector("strong").textContent;
  try {
    if (button.dataset.action === "delete") {
      if (!confirm(`¿Eliminar a ${name} y todo su historial de llamadas?`)) return;
      await api("DELETE", `/api/admin/executives/${item.dataset.id}`);
    } else {
      if (!confirm(`Se generará un código nuevo para ${name}. El teléfono actual dejará de enviar datos hasta ingresar el código nuevo. ¿Continuar?`)) return;
      await api("POST", `/api/admin/executives/${item.dataset.id}/pair-code`, {});
    }
    await renderManage();
  } catch (error) {
    alert(error.message);
  }
});

document.addEventListener("visibilitychange", () => { if (!document.hidden && state.token) refresh(); });

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

if (state.token) enterApp();
else $("login").hidden = false;
