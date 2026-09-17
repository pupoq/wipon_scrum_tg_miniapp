const telegram = window.Telegram?.WebApp;
const apiBaseUrl = String(window.APP_CONFIG?.API_BASE_URL || "").replace(/\/$/, "");
const state = { bootstrap: null, structured: null, filter: "all" };

const $ = (id) => document.getElementById(id);

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function setLoading(button, loading, text) {
  button.disabled = loading;
  if (!button.dataset.label) button.dataset.label = button.innerHTML;
  button.innerHTML = loading ? `<span class="spinner-inline"></span> ${text}` : button.dataset.label;
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.add("hidden"), 2600);
}

async function api(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": telegram?.initData || "",
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || `Ошибка ${response.status}`);
  return body;
}

function openTab(name) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === name));
  document.querySelectorAll(".page").forEach((page) => page.classList.toggle("active", page.id === `page-${name}`));
  telegram?.HapticFeedback?.selectionChanged();
}

function addListSection(container, title, items, icon) {
  const block = document.createElement("div");
  block.className = "structured-block";
  const heading = document.createElement("h3");
  heading.textContent = `${icon} ${title}`;
  block.appendChild(heading);
  if (items?.length) {
    const list = document.createElement("ul");
    items.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      list.appendChild(li);
    });
    block.appendChild(list);
  } else {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Не указано";
    block.appendChild(empty);
  }
  container.appendChild(block);
}

function renderStructured(structured, aiAvailable = true) {
  state.structured = structured;
  const container = $("structured-sections");
  container.replaceChildren();
  addListSection(container, "Сделано", structured.completed, "✅");
  addListSection(container, "Планы", structured.planned, "🎯");
  addListSection(container, "Блокеры", structured.blockers, "⛔");
  addListSection(container, "Риски", structured.risks, "⚠️");
  if (structured.quality_issue) {
    const warning = document.createElement("p");
    warning.className = "warning";
    warning.textContent = structured.quality_issue;
    container.appendChild(warning);
  }
  $("ai-badge").textContent = aiAvailable ? "AI" : "RAW";
  $("preview").classList.remove("hidden");
  $("preview").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderTeam() {
  const people = state.bootstrap.team;
  const submitted = people.filter((person) => person.submitted).length;
  const percent = people.length ? Math.round((submitted / people.length) * 100) : 0;
  $("progress-value").textContent = `${percent}%`;
  $("progress-ring").style.setProperty("--progress", `${percent}%`);
  $("team-count").textContent = `Сдали ${submitted} из ${people.length}`;

  const filtered = people.filter((person) => {
    if (state.filter === "submitted") return person.submitted;
    if (state.filter === "missing") return !person.submitted;
    return true;
  });
  const list = $("team-list");
  list.replaceChildren();
  filtered.forEach((person) => {
    const card = document.createElement("article");
    card.className = "person-card";
    const avatar = document.createElement("div");
    avatar.className = "person-avatar";
    avatar.textContent = initials(person.name);
    const info = document.createElement("div");
    info.className = "person-info";
    const name = document.createElement("p");
    name.className = "person-name";
    name.textContent = person.name;
    const role = document.createElement("p");
    role.className = "person-role";
    role.textContent = [person.role, person.team].filter(Boolean).join(" · ") || "Участник команды";
    const status = document.createElement("span");
    status.className = `person-status${person.submitted ? " done" : ""}`;
    status.title = person.submitted ? "Daily сдан" : "Daily не сдан";
    info.append(name, role);
    card.append(avatar, info, status);
    list.appendChild(card);
  });
}

function summaryList(title, items) {
  if (!items?.length) return null;
  const card = document.createElement("article");
  card.className = "summary-card";
  const heading = document.createElement("h3");
  heading.textContent = title;
  const list = document.createElement("ul");
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    list.appendChild(li);
  });
  card.append(heading, list);
  return card;
}

function renderSummary(result) {
  const summary = result.summary;
  const container = $("summary-content");
  container.replaceChildren();
  const overview = document.createElement("article");
  overview.className = "summary-card";
  const title = document.createElement("h3");
  title.textContent = result.from_cache ? "Обзор · из кэша" : "Обзор · новый";
  const text = document.createElement("p");
  text.textContent = summary.overview;
  overview.append(title, text);
  container.appendChild(overview);
  [
    ["Основные направления", summary.workstreams],
    ["Блокеры", summary.team_blockers],
    ["Риски", summary.risks],
    ["Требуют внимания", summary.attention],
  ].forEach(([heading, items]) => {
    const card = summaryList(heading, items);
    if (card) container.appendChild(card);
  });
  summary.people?.forEach((person) => {
    const details = [
      ...(person.completed || []).map((item) => `Сделано: ${item}`),
      ...(person.planned || []).map((item) => `План: ${item}`),
      ...(person.blockers || []).map((item) => `Блокер: ${item}`),
      ...(person.quality_issue ? [`Уточнить: ${person.quality_issue}`] : []),
    ];
    const card = summaryList(person.name, details);
    if (card) container.appendChild(card);
  });
}

async function initialize() {
  if (!telegram?.initData) throw new Error("Откройте Mini App кнопкой внутри Telegram-бота.");
  telegram.ready();
  telegram.expand();
  const data = await api("/api/bootstrap");
  state.bootstrap = data;
  $("greeting").textContent = `Привет, ${data.user.name.split(" ")[0]}`;
  $("user-role").textContent = [data.user.role, data.user.team].filter(Boolean).join(" · ");
  $("avatar").textContent = initials(data.user.name);
  $("today-date").textContent = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${data.date}T12:00:00`));
  $("own-status").textContent = data.report ? "Daily сдан" : "Не заполнен";
  $("own-status").className = `status-pill ${data.report ? "done" : "pending"}`;
  if (data.report) {
    $("daily-text").value = data.report.raw_text || "";
    $("char-count").textContent = $("daily-text").value.length;
    if (Object.keys(data.report.structured || {}).length) renderStructured(data.report.structured, true);
  }
  if (data.permissions.can_use_ai_summary) $("summary-tab").classList.remove("hidden");
  renderTeam();
  $("loading").classList.add("hidden");
  $("app").classList.remove("hidden");
}

document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => openTab(tab.dataset.tab)));
document.querySelectorAll(".filter").forEach((filter) => filter.addEventListener("click", () => {
  state.filter = filter.dataset.filter;
  document.querySelectorAll(".filter").forEach((item) => item.classList.toggle("active", item === filter));
  renderTeam();
}));

$("daily-text").addEventListener("input", (event) => {
  $("char-count").textContent = event.target.value.length;
  state.structured = null;
  $("preview").classList.add("hidden");
});

$("analyze-button").addEventListener("click", async () => {
  const rawText = $("daily-text").value.trim();
  if (rawText.length < 3) return showToast("Сначала напишите отчёт");
  const button = $("analyze-button");
  setLoading(button, true, "Разбираю…");
  try {
    const result = await api("/api/daily/parse", { method: "POST", body: JSON.stringify({ raw_text: rawText }) });
    renderStructured(result.structured, result.ai_available);
    telegram?.HapticFeedback?.notificationOccurred("success");
  } catch (error) {
    showToast(error.message);
    telegram?.HapticFeedback?.notificationOccurred("error");
  } finally {
    setLoading(button, false);
  }
});

$("save-button").addEventListener("click", async () => {
  if (!state.structured) return showToast("Сначала разберите отчёт");
  const button = $("save-button");
  setLoading(button, true, "Сохраняю…");
  try {
    await api("/api/daily/save", {
      method: "POST",
      body: JSON.stringify({ raw_text: $("daily-text").value.trim(), structured: state.structured }),
    });
    state.bootstrap.report = { raw_text: $("daily-text").value.trim(), structured: state.structured };
    const own = state.bootstrap.team.find((person) => person.id === state.bootstrap.user.id);
    if (own) own.submitted = true;
    $("own-status").textContent = "Daily сдан";
    $("own-status").className = "status-pill done";
    renderTeam();
    showToast("Daily сохранён");
    telegram?.HapticFeedback?.notificationOccurred("success");
  } catch (error) {
    showToast(error.message);
  } finally {
    setLoading(button, false);
  }
});

$("summary-button").addEventListener("click", async () => {
  const button = $("summary-button");
  setLoading(button, true, "Формирую сводку…");
  try {
    renderSummary(await api("/api/ai-summary"));
  } catch (error) {
    showToast(error.message);
  } finally {
    setLoading(button, false);
  }
});

initialize().catch((error) => {
  $("loading").classList.add("hidden");
  $("fatal-text").textContent = error.message;
  $("fatal").classList.remove("hidden");
  telegram?.ready();
});
