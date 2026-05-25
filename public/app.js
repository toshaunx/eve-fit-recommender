const form = document.querySelector("#fitForm");
const results = document.querySelector("#results");
const statusBox = document.querySelector("#status");
const shareBtn = document.querySelector("#shareBtn");
const feedbackForm = document.querySelector("#feedbackForm");

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

async function loadRecommendations(event) {
  event?.preventDefault();
  const params = paramsFromForm();
  const nextUrl = `${location.pathname}?${params.toString()}`;
  history.replaceState(null, "", nextUrl);
  results.innerHTML = "";
  setStatus("正在请求 EVE Workbench 并筛选候选 Fit...");
  try {
    const response = await fetch(`/api/recommend?${params.toString()}`);
    const data = await response.json();
    renderFits(data.fits || []);
    const sourceName = data.source === "eve-workbench" ? "已从 Fit 仓库获取真实推荐。" : "当前显示演示数据。";
    setStatus(data.warning ? `${sourceName} ${data.warning}` : sourceName, data.source === "demo" ? "warning" : "normal");
  } catch (error) {
    setStatus(`请求失败：${error.message}`, "warning");
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
  });
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
