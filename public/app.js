const form = document.querySelector("#fitForm");
const results = document.querySelector("#results");
const statusBox = document.querySelector("#status");
const shareBtn = document.querySelector("#shareBtn");
const feedbackForm = document.querySelector("#feedbackForm");
let staticFitsCache = null;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(message, tone = "normal") {
  statusBox.textContent = message;
  statusBox.classList.toggle("warning", tone === "warning");
}

function paramsFromForm() {
  const data = new FormData(form);
  return new URLSearchParams({
    activity: data.get("activity"),
    ship: data.get("ship"),
    clone: data.get("clone"),
    budget: data.get("budget"),
  });
}

function renderFits(fits) {
  results.innerHTML = fits.map((fit) => {
    const tags = (fit.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
    const source = fit.sourceUrl
      ? `<a href="${escapeHtml(fit.sourceUrl)}" target="_blank" rel="noreferrer">查看来源</a>`
      : `<span>${escapeHtml(fit.source || "Local")}</span>`;
    return `
      <article class="fit-card">
        <header>
          <div>
            <h3 class="fit-title">${escapeHtml(fit.title)}</h3>
            <div class="fit-meta">
              <span class="tag">${escapeHtml(fit.ship)}</span>
              ${tags}
            </div>
          </div>
          <div class="score">${escapeHtml(fit.score)}</div>
        </header>
        <div class="fit-body">
          <p>${escapeHtml(fit.reason)}</p>
          <pre>${escapeHtml(fit.eft)}</pre>
          <div class="fit-actions">
            <button class="copy" type="button" data-eft="${escapeHtml(fit.eft)}">复制 EFT</button>
            ${source}
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function text(value) {
  return String(value || "").toLowerCase();
}

function activityKeywords(activity) {
  return {
    pve: ["pve", "mission", "ratting", "anomaly", "combat site", "abyss", "t0", "t1"],
    pvp: ["pvp", "solo", "fleet", "tackle", "kite", "brawl"],
    exploration: ["exploration", "explorer", "relic", "data", "scanner", "probe"],
    mining: ["mining", "miner", "ore", "venture", "barge"],
    abyss: ["abyss", "abyssal", "filament", "t0", "t1", "t2", "t3"],
    hauling: ["hauling", "hauler", "transport", "cargo", "industrial"],
  }[activity] || [];
}

function activityTags(activity) {
  return {
    pve: ["PVE", "Mission", "Ratting", "Abyss"],
    pvp: ["PVP", "Solo", "Fleet"],
    exploration: ["Exploration", "Scanner", "Relic", "Data"],
    mining: ["Mining"],
    abyss: ["Abyss", "Abyssal"],
    hauling: ["Hauling", "Transport"],
  }[activity] || [];
}

function formatIsk(value) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B ISK`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M ISK`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K ISK`;
  return `${Math.round(value)} ISK`;
}

function scoreStaticFit(fit, query) {
  const haystack = text([fit.name, fit.shipName, fit.shipClass, (fit.tags || []).join(" "), fit.eft].join(" "));
  let value = 42;
  const ship = text(query.ship);
  if (ship && haystack.includes(ship)) value += 28;
  if (ship && !haystack.includes(ship)) value -= 18;
  for (const keyword of activityKeywords(query.activity)) {
    if (haystack.includes(keyword)) value += 8;
  }
  for (const tag of activityTags(query.activity)) {
    if (haystack.includes(text(tag))) value += 8;
  }
  if (query.clone === "alpha") value += fit.isAlphaUsable ? 14 : -12;
  if (query.budget === "low" && typeof fit.totalCost === "number") {
    if (fit.totalCost <= 50_000_000) value += 14;
    if (fit.totalCost > 200_000_000) value -= 18;
  }
  if (fit.runs > 0) value += Math.min(10, Math.log10(fit.runs + 1) * 4);
  if (/x\d+/i.test(fit.eft)) value += 4;
  return Math.round(Math.max(0, Math.min(100, value)));
}

async function loadStaticFits() {
  if (staticFitsCache) return staticFitsCache;
  const response = await fetch("data/fits.json");
  const data = await response.json();
  staticFitsCache = data.fits || [];
  return staticFitsCache;
}

function staticReason(fit, query, score) {
  const activity = {
    pve: "PVE 刷怪/任务",
    pvp: "PVP",
    exploration: "探索",
    mining: "挖矿",
    abyss: "深渊",
    hauling: "运输",
  }[query.activity] || "当前玩法";
  const quality = score >= 70 ? "匹配度较高，可以作为第一套候选。" : "匹配度一般，建议先看装备和技能要求。";
  const cost = typeof fit.totalCost === "number" ? `估价约 ${formatIsk(fit.totalCost)}。` : "";
  const alpha = fit.isAlphaUsable ? "标记为 Alpha 可用。" : "未标记为 Alpha 可用，复制前要确认技能。";
  const runs = fit.runs ? `Workbench 记录了 ${fit.runs} 次相关运行/使用数据。` : "";
  return `${fit.shipName || "这艘船"} 的这套配置和「${activity}」方向相关。${quality} ${cost}${alpha} ${runs}`.trim();
}

async function recommendFromStatic(params) {
  const query = Object.fromEntries(params.entries());
  const fits = await loadStaticFits();
  const ship = text(query.ship);
  const keywords = activityKeywords(query.activity);
  const rough = fits.filter((fit) => {
    const haystack = text([fit.name, fit.shipName, fit.shipClass, (fit.tags || []).join(" ")].join(" "));
    if (ship && !haystack.includes(ship)) return false;
    return !keywords.length
      || keywords.some((keyword) => haystack.includes(keyword))
      || activityTags(query.activity).some((tag) => haystack.includes(text(tag)));
  });
  return (rough.length ? rough : fits)
    .map((fit) => {
      const value = scoreStaticFit(fit, query);
      const outputTags = [...new Set([
        ...(fit.tags || []).slice(0, 4),
        fit.isAlphaUsable ? "Alpha 可用" : "",
        typeof fit.totalCost === "number" ? formatIsk(fit.totalCost) : "",
        query.budget === "low" ? "低预算" : "",
        /\bii\b/i.test(fit.eft) ? "含 T2 装备" : "",
        /probe|relic|data/i.test(fit.eft) ? "扫描/探索" : "",
        /missile|launcher/i.test(fit.eft) ? "导弹" : "",
      ].filter(Boolean))].slice(0, 6);
      return {
        id: fit.id,
        title: fit.name ? `${fit.name} (${fit.shipClass || "Ship"} - ${fit.shipName})` : fit.shipName,
        ship: fit.shipName || "Unknown ship",
        score: value,
        source: "EVE Workbench",
        sourceUrl: fit.sourceUrl,
        tags: outputTags,
        reason: staticReason(fit, query, value),
        eft: fit.eft,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

async function loadRecommendations(event) {
  event?.preventDefault();
  const params = paramsFromForm();
  const nextUrl = `${location.pathname}?${params.toString()}`;
  history.replaceState(null, "", nextUrl);
  results.innerHTML = "";
  setStatus("正在请求 EVE Workbench 并筛选候选 Fit...");
  try {
    const response = await fetch(`/api/recommend?${params.toString()}`);
    if (!response.ok) throw new Error("API unavailable");
    const data = await response.json();
    renderFits(data.fits || []);
    const sourceName = data.source === "eve-workbench" ? "已从 Fit 仓库获取真实推荐。" : "当前显示演示数据。";
    setStatus(data.warning ? `${sourceName} ${data.warning}` : sourceName, data.source === "demo" ? "warning" : "normal");
  } catch (error) {
    try {
      const fits = await recommendFromStatic(params);
      renderFits(fits);
      setStatus("已从静态 Fit 仓库获取推荐。");
    } catch (staticError) {
      setStatus(`请求失败：${staticError.message}`, "warning");
    }
  }
}

results.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-eft]");
  if (!button) return;
  await navigator.clipboard.writeText(button.dataset.eft);
  const oldText = button.textContent;
  button.textContent = "已复制";
  setTimeout(() => {
    button.textContent = oldText;
  }, 1400);
});

shareBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(location.href);
  const oldText = shareBtn.textContent;
  shareBtn.textContent = "已复制链接";
  setTimeout(() => {
    shareBtn.textContent = oldText;
  }, 1400);
});

feedbackForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(feedbackForm).entries());
  await fetch("/api/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  }).catch(() => {});
  feedbackForm.reset();
  setStatus("反馈已记录。验证阶段先写入服务端日志，后续接数据库。");
});

function hydrateFromUrl() {
  const params = new URLSearchParams(location.search);
  for (const [key, value] of params.entries()) {
    const field = form.elements[key];
    if (field) field.value = value;
  }
  if ([...params.keys()].length) loadRecommendations();
}

form.addEventListener("submit", loadRecommendations);
hydrateFromUrl();
