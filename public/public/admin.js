// Cherry Spins admin panel client
const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const $ = (s) => document.querySelector(s);
const statusEl = $("#status");
const initData = tg?.initData || "";

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": initData,
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Ошибка ${response.status}`);
  return data;
}
function say(message, bad = false) {
  statusEl.textContent = message;
  statusEl.className = bad ? "status error" : "status";
}
function fmt(value) {
  return new Intl.NumberFormat("ru-RU").format(Number(value || 0));
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[c]);
}
function renderHistory(rows) {
  $("#history").innerHTML = rows.length ? rows.map(row => `
    <div class="history-row">
      <div><b>${escapeHtml(row.action === "credit" ? "Начисление" : "Списание")}</b>
      <small>${escapeHtml(row.player_name || row.user_id)} · ${new Date(row.created_at * 1000).toLocaleString("ru-RU")}</small></div>
      <strong class="${row.action === "credit" ? "plus" : "minus"}">${row.action === "credit" ? "+" : "−"}${fmt(row.amount)}</strong>
    </div>`).join("") : `<p class="muted">Операций пока нет.</p>`;
}
async function loadStats() {
  const data = await api("/api/admin/overview");
  $("#players").textContent = fmt(data.players);
  $("#issued").textContent = fmt(data.total_issued);
  renderHistory(data.history);
}
async function findPlayer() {
  const id = $("#telegramId").value.trim();
  if (!/^\d+$/.test(id)) throw new Error("Введи числовой Telegram ID игрока.");
  const data = await api(`/api/admin/player/${encodeURIComponent(id)}`);
  $("#player").innerHTML = `
    <div class="player-card">
      <div><b>${escapeHtml(data.first_name || data.username || "Игрок")}</b>
      <small>ID: ${escapeHtml(data.id)} ${data.username ? " · @" + escapeHtml(data.username) : ""}</small></div>
      <strong>${fmt(data.balance)} 🍒</strong>
    </div>`;
  $("#amount").disabled = false;
  $("#credit").disabled = false;
  $("#debit").disabled = false;
  say("Игрок найден. Проверь ID и баланс перед операцией.");
}
async function changeBalance(action) {
  const id = $("#telegramId").value.trim();
  const amount = Number($("#amount").value);
  if (!/^\d+$/.test(id)) throw new Error("Сначала найди игрока по Telegram ID.");
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100000000)
    throw new Error("Количество должно быть целым числом от 1 до 100 000 000.");
  if (!confirm(`${action === "credit" ? "Начислить" : "Списать"} ${fmt(amount)} очков игроку ${id}?`)) return;
  const data = await api("/api/admin/balance", {
    method: "POST", body: JSON.stringify({ userId: id, amount, action })
  });
  $("#player").innerHTML = `
    <div class="player-card">
      <div><b>${escapeHtml(data.first_name || data.username || "Игрок")}</b><small>ID: ${escapeHtml(data.id)}</small></div>
      <strong>${fmt(data.balance)} 🍒</strong>
    </div>`;
  say(action === "credit" ? "Очки успешно начислены." : "Очки успешно списаны.");
  await loadStats();
}
$("#find").addEventListener("click", async () => {
  try { await findPlayer(); } catch (e) { say(e.message, true); }
});
$("#credit").addEventListener("click", async () => {
  try { await changeBalance("credit"); } catch (e) { say(e.message, true); }
});
$("#debit").addEventListener("click", async () => {
  try { await changeBalance("debit"); } catch (e) { say(e.message, true); }
});
$("#refresh").addEventListener("click", async () => {
  try { await loadStats(); say("Данные обновлены."); } catch (e) { say(e.message, true); }
});
(async () => {
  if (!initData) {
    say("Открой /admin из Telegram Mini App. В обычном браузере авторизация Telegram недоступна.", true);
    return;
  }
  try { await loadStats(); say("Админ-панель подключена."); }
  catch (e) { say(e.message, true); }
})();
