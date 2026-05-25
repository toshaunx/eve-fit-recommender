import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const workbenchBase = "https://api.eveworkbench.com/v1";
const workbenchWebBase = "https://webapi.eveworkbench.com";
const cache = new Map();

await loadLocalEnv();
const workbenchApiKey = process.env.EVE_WORKBENCH_API_KEY || "";

async function loadLocalEnv() {
  try {
    const env = await readFile(join(__dirname, ".env"), "utf8");
    for (const line of env.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // A local .env is optional. The app can run in demo mode without it.
  }
}

const demoFits = [
  {
    id: "demo-heron-alpha",
    title: "Heron Alpha Relic/Data Starter",
    ship: "Heron",
    activity: "exploration",
    score: 88,
    source: "Demo fallback",
    tags: ["Alpha", "Exploration", "Low budget"],
    reason: "低成本探索船，适合新人跑数据/遗迹点，损失压力小。",
    eft: `[Heron, Alpha Relic/Data Starter]
Type-D Restrained Nanofiber Structure

5MN Y-T8 Compact Microwarpdrive
Relic Analyzer I
Data Analyzer I
Scan Rangefinding Array I
Scan Pinpointing Array I

Core Probe Launcher I
Prototype Cloaking Device I

Small Gravity Capacitor Upgrade I
Small Gravity Capacitor Upgrade I


Core Scanner Probe I x16`,
  },
  {
    id: "demo-caracal-pve",
    title: "Caracal Alpha Level 2 Mission",
    ship: "Caracal",
    activity: "pve",
    score: 82,
    source: "Demo fallback",
    tags: ["Alpha", "PVE", "Low budget"],
    reason: "导弹巡洋舰打法直接，适合 2 级任务和基础刷怪，注意保持距离。",
    eft: `[Caracal, Alpha Level 2 Mission]
Ballistic Control System I
Ballistic Control System I

Large Shield Extender I
Multispectrum Shield Hardener I
10MN Monopropellant Enduring Afterburner
Missile Guidance Computer I
Large Shield Extender I

Rapid Light Missile Launcher I
Rapid Light Missile Launcher I
Rapid Light Missile Launcher I
Rapid Light Missile Launcher I
Rapid Light Missile Launcher I

Medium Core Defense Field Extender I
Medium Core Defense Field Extender I
Medium Core Defense Field Extender I


Scourge Light Missile x1000`,
  },
  {
    id: "demo-venture-mining",
    title: "Venture Beginner Mining",
    ship: "Venture",
    activity: "mining",
    score: 79,
    source: "Demo fallback",
    tags: ["Alpha", "Mining", "Low budget"],
    reason: "新人挖矿入门船，便宜、好补、技能门槛低。",
    eft: `[Venture, Beginner Mining]
Mining Laser Upgrade I

1MN Monopropellant Enduring Afterburner
Medium Shield Extender I
Survey Scanner I

Miner I
Miner I

Small Core Defense Field Extender I
Small Core Defense Field Extender I
Small Core Defense Field Extender I


Hobgoblin I x2`,
  },
];

function demoRecommendations(query) {
  const activity = normalizeText(query.activity);
  const ship = normalizeText(query.ship);
  const scored = demoFits
    .map((fit) => {
      let score = fit.score;
      if (activity && fit.activity === activity) score += 10;
      if (ship && normalizeText(fit.ship).includes(ship)) score += 16;
      if (ship && !normalizeText(fit.ship).includes(ship)) score -= 12;
      return { ...fit, score: Math.max(0, Math.min(100, score)) };
    })
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, 3);
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function json(res, status, data) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(data));
}

function getCached(key) {
  const hit = cache.get(key);
  if (!hit || hit.expires < Date.now()) return null;
  return hit.value;
}

function setCached(key, value, ttlMs) {
  cache.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

async function fetchJson(pathname) {
  const cacheKey = `json:${pathname}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const response = await fetch(`${workbenchBase}${pathname}`, {
    headers: {
      accept: "application/json",
      ...(workbenchApiKey ? { "X-API-KEY": workbenchApiKey } : {}),
    },
  });
  if (!response.ok) {
    throw new Error(`EVE Workbench ${pathname} returned ${response.status}`);
  }
  return setCached(cacheKey, await response.json(), 15 * 60 * 1000);
}

async function fetchText(pathname) {
  const cacheKey = `text:${pathname}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const response = await fetch(`${workbenchBase}${pathname}`, {
    headers: {
      accept: "text/plain, application/json",
      ...(workbenchApiKey ? { "X-API-KEY": workbenchApiKey } : {}),
    },
  });
  if (!response.ok) {
    throw new Error(`EVE Workbench ${pathname} returned ${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await response.json();
    return setCached(cacheKey, data.eft || data.value || data.data || "", 30 * 60 * 1000);
  }
  return setCached(cacheKey, await response.text(), 30 * 60 * 1000);
}

async function fetchWorkbenchWeb(pathname, options = {}) {
  const method = options.method || "GET";
  const body = options.body ? JSON.stringify(options.body) : undefined;
  const cacheKey = `${method}:${pathname}:${body || ""}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const response = await fetch(`${workbenchWebBase}${pathname}`, {
    method,
    body,
    headers: {
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Workbench Web API ${pathname} returned ${response.status}`);
  }
  return setCached(cacheKey, await response.json(), 15 * 60 * 1000);
}

function asArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.fits)) return payload.fits;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.result)) return payload.result;
  return [];
}

function fitId(fit) {
  return fit.fitId || fit.fittingId || fit.id || fit.fitID || fit.ID;
}

function fitTitle(fit) {
  return fit.name || fit.fitName || fit.title || fit.fittingName || fit.description || "Untitled Fit";
}

function fitShip(fit, eft = "") {
  const fromFit = fit.ship || fit.shipName || fit.shipTypeName || fit.typeName;
  if (fromFit) return String(fromFit);
  const match = eft.match(/^\[([^,\]]+)/m);
  return match ? match[1].trim() : "Unknown ship";
}

function publicFitId(fit) {
  return fit.id || fit.fitId || fit.fittingId;
}

function publicFitTitle(fit) {
  const ship = fit.shipName ? `${fit.shipClass || "Ship"} - ${fit.shipName}` : "Fit";
  return fit.name ? `${fit.name} (${ship})` : ship;
}

function tagNames(fit) {
  return (fit.tags || []).map((tag) => typeof tag === "string" ? tag : tag.name).filter(Boolean);
}

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function selectedActivityKeywords(activity) {
  const map = {
    pve: ["pve", "mission", "missions", "ratting", "anomaly", "combat site", "level 2", "level 3"],
    pvp: ["pvp", "solo", "fleet", "tackle", "kite", "brawl", "small gang"],
    exploration: ["exploration", "explorer", "relic", "data", "scanner", "probe"],
    mining: ["mining", "miner", "ore", "venture", "barge"],
    abyss: ["abyss", "abyssal", "filament", "t0", "t1", "t2", "t3"],
    hauling: ["hauling", "hauler", "transport", "cargo", "industrial"],
  };
  return map[activity] || [];
}

function selectedActivityTags(activity) {
  const map = {
    pve: ["PVE", "Mission", "Ratting"],
    pvp: ["PVP", "Solo", "Fleet"],
    exploration: ["Exploration", "Scanner", "Relic", "Data"],
    mining: ["Mining"],
    abyss: ["Abyss", "Abyssal"],
    hauling: ["Hauling", "Transport"],
  };
  return map[activity] || [];
}

function scoreFit(fit, eft, query) {
  const haystack = normalizeText([
    fitTitle(fit),
    fitShip(fit, eft),
    fit.description,
    fit.notes,
    fit.tags,
    eft,
  ].filter(Boolean).join(" "));
  let score = 40;
  const ship = normalizeText(query.ship);
  if (ship && haystack.includes(ship)) score += 24;
  for (const keyword of selectedActivityKeywords(query.activity)) {
    if (haystack.includes(keyword)) score += 8;
  }
  if (query.clone === "alpha" && /\bii\b|prototype cloaking device|covert ops|interdiction|command burst/i.test(eft)) {
    score -= 14;
  }
  if (query.budget === "low" && /deadspace|officer|faction|navy issue|republic fleet|true sansha|pithum|gistum|corpum/i.test(eft)) {
    score -= 18;
  }
  if (/x\d+/i.test(eft)) score += 4;
  if (/probe|missile|charge|crystal|script|drone/i.test(eft)) score += 4;
  if ((eft.match(/\n/g) || []).length < 8) score -= 18;
  return Math.max(0, Math.min(100, score));
}

function buildReason(fit, eft, query, score) {
  const ship = fitShip(fit, eft);
  const activityName = {
    pve: "PVE 刷怪/任务",
    pvp: "PVP",
    exploration: "探索",
    mining: "挖矿",
    abyss: "深渊",
    hauling: "运输",
  }[query.activity] || "当前玩法";
  const caveat = score < 60 ? "匹配度一般，建议先看装备和技能要求。" : "匹配度较高，可以作为第一套候选。";
  return `${ship} 的这套配置和「${activityName}」方向相关。${caveat} 复制前请在游戏内确认 CPU/PG、技能和当前版本环境。`;
}

function buildPublicReason(fit, query, score) {
  const activityName = {
    pve: "PVE 刷怪/任务",
    pvp: "PVP",
    exploration: "探索",
    mining: "挖矿",
    abyss: "深渊",
    hauling: "运输",
  }[query.activity] || "当前玩法";
  const cost = typeof fit.totalCost === "number" ? `估价约 ${formatIsk(fit.totalCost)}。` : "";
  const alpha = fit.isAlphaUsable ? "标记为 Alpha 可用。" : "未标记为 Alpha 可用，复制前要确认技能。";
  const runs = fit.runs ? `Workbench 记录了 ${fit.runs} 次相关运行/使用数据。` : "";
  const caveat = score >= 70 ? "匹配度较高，可以作为第一套候选。" : "匹配度一般，建议先看装备和技能要求。";
  return `${fit.shipName || "这艘船"} 的这套配置和「${activityName}」方向相关。${caveat} ${cost}${alpha} ${runs}`.trim();
}

function formatIsk(value) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B ISK`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M ISK`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K ISK`;
  return `${Math.round(value)} ISK`;
}

function inferTags(eft, query) {
  const tags = [];
  if (query.budget === "low") tags.push("低预算");
  if (/\bii\b/i.test(eft)) tags.push("含 T2 装备");
  if (/probe|relic|data/i.test(eft)) tags.push("扫描/探索");
  if (/missile|launcher/i.test(eft)) tags.push("导弹");
  if (/miner|strip miner/i.test(eft)) tags.push("采矿");
  if (/scrambler|disruptor|webifier/i.test(eft)) tags.push("PVP 控制");
  return tags.slice(0, 5);
}

function inferPublicTags(fit, query, eft) {
  const tags = tagNames(fit).slice(0, 4);
  if (fit.isAlphaUsable) tags.unshift("Alpha 可用");
  if (typeof fit.totalCost === "number") tags.push(formatIsk(fit.totalCost));
  return [...new Set([...tags, ...inferTags(eft, query)])].slice(0, 6);
}

function scorePublicFit(fit, eft, query) {
  const haystack = normalizeText([
    fit.name,
    fit.shipName,
    fit.shipClass,
    tagNames(fit).join(" "),
    eft,
  ].join(" "));
  let score = 42;
  const ship = normalizeText(query.ship);
  if (ship && haystack.includes(ship)) score += 28;
  if (ship && !haystack.includes(ship)) score -= 18;
  for (const keyword of selectedActivityKeywords(query.activity)) {
    if (haystack.includes(keyword)) score += 8;
  }
  for (const tag of selectedActivityTags(query.activity)) {
    if (haystack.includes(normalizeText(tag))) score += 8;
  }
  if (query.clone === "alpha") score += fit.isAlphaUsable ? 14 : -12;
  if (query.budget === "low" && typeof fit.totalCost === "number") {
    if (fit.totalCost <= 50_000_000) score += 14;
    if (fit.totalCost > 200_000_000) score -= 18;
  }
  if (query.budget === "mid" && typeof fit.totalCost === "number" && fit.totalCost <= 250_000_000) score += 8;
  if (fit.runs > 0) score += Math.min(10, Math.log10(fit.runs + 1) * 4);
  if (/x\d+/i.test(eft)) score += 4;
  return Math.round(Math.max(0, Math.min(100, score)));
}

async function fetchPublicCandidates(query) {
  const requests = [
    fetchWorkbenchWeb("/Fit/GetLatest?alpha=true"),
    fetchWorkbenchWeb("/Fit/GetNewestFits"),
    fetchWorkbenchWeb("/Fit/GetPopularFits"),
  ];
  for (const tags of selectedActivityTags(query.activity).slice(0, 2)) {
    requests.push(fetchWorkbenchWeb(`/Fit/GetFitsByTag?tags=${encodeURIComponent(tags)}&popular=false`));
  }
  const responses = await Promise.allSettled(requests);
  const byId = new Map();
  for (const response of responses) {
    if (response.status !== "fulfilled") continue;
    for (const fit of asArray(response.value?.result || response.value)) {
      const id = publicFitId(fit);
      if (id && !byId.has(id)) byId.set(id, fit);
    }
  }
  return [...byId.values()];
}

async function fetchPublicEft(id) {
  const data = await fetchWorkbenchWeb(`/Fit/GetEftById?id=${encodeURIComponent(id)}&type=eft`);
  return data?.result?.eft || "";
}

async function recommendPublicFits(query) {
  const candidates = await fetchPublicCandidates(query);
  const shipNeedle = normalizeText(query.ship);
  const activityKeywords = selectedActivityKeywords(query.activity);
  const rough = candidates
    .filter((fit) => {
      const text = normalizeText([fit.name, fit.shipName, fit.shipClass, tagNames(fit).join(" ")].join(" "));
      if (shipNeedle && !text.includes(shipNeedle)) return false;
      if (!activityKeywords.length) return true;
      return activityKeywords.some((keyword) => text.includes(keyword))
        || selectedActivityTags(query.activity).some((tag) => text.includes(normalizeText(tag)));
    });
  const selected = (rough.length ? rough : candidates).slice(0, 24);
  const enriched = [];
  for (const fit of selected) {
    const id = publicFitId(fit);
    if (!id) continue;
    try {
      const eft = await fetchPublicEft(id);
      if (!eft || !eft.includes("[")) continue;
      const score = scorePublicFit(fit, eft, query);
      enriched.push({
        id,
        title: publicFitTitle(fit),
        ship: fit.shipName || fitShip({}, eft),
        score,
        source: "EVE Workbench",
        sourceUrl: `https://www.eveworkbench.com/fit/${id}`,
        tags: inferPublicTags(fit, query, eft),
        reason: buildPublicReason(fit, query, score),
        eft,
      });
    } catch {
      // Keep going; individual public fits can disappear or fail to export.
    }
  }
  return enriched.sort((a, b) => b.score - a.score).slice(0, 3);
}

async function recommendFits(query) {
  try {
    const publicFits = await recommendPublicFits(query);
    if (publicFits.length) {
      return { source: "eve-workbench", fits: publicFits };
    }
  } catch {
    // Fall through to API-key flow or demo fallback.
  }

  let list;
  try {
    if (!workbenchApiKey) {
      throw new Error("demo-mode");
    }
    list = asArray(await fetchJson("/fits/list"));
  } catch (error) {
    const warning = error.message === "demo-mode"
      ? "当前为演示数据。接入 Workbench Fit 仓库后会返回真实推荐。"
      : "Fit 仓库暂时不可用，当前显示演示数据。";
    return { source: "demo", warning, fits: demoRecommendations(query) };
  }

  const shipNeedle = normalizeText(query.ship);
  const activityKeywords = selectedActivityKeywords(query.activity);
  const roughCandidates = list
    .filter((fit) => {
      const text = normalizeText([fitTitle(fit), fitShip(fit), fit.description, fit.tags].join(" "));
      if (shipNeedle && !text.includes(shipNeedle)) return false;
      if (!activityKeywords.length) return true;
      return activityKeywords.some((keyword) => text.includes(keyword));
    })
    .slice(0, 16);

  const candidates = roughCandidates.length ? roughCandidates : list.slice(0, 16);
  const enriched = [];
  for (const fit of candidates) {
    const id = fitId(fit);
    if (!id) continue;
    try {
      const eft = await fetchText(`/fits/${id}/eft`);
      if (!eft || !eft.includes("[")) continue;
      const score = scoreFit(fit, eft, query);
      enriched.push({
        id: String(id),
        title: fitTitle(fit),
        ship: fitShip(fit, eft),
        score,
        source: "EVE Workbench",
        sourceUrl: `https://www.eveworkbench.com/fitting/${id}`,
        tags: inferTags(eft, query),
        reason: buildReason(fit, eft, query, score),
        eft,
      });
    } catch {
      // Skip individual fits that fail, keep the recommendation flow alive.
    }
  }

  const fits = enriched.sort((a, b) => b.score - a.score).slice(0, 3);
  if (!fits.length) {
    return {
      source: "demo",
      warning: "未从 Fit 仓库匹配到可用 EFT，当前显示演示数据。",
      fits: demoRecommendations(query),
    };
  }
  return { source: "eve-workbench", fits };
}

async function handleRecommend(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const query = {
    activity: url.searchParams.get("activity") || "pve",
    clone: url.searchParams.get("clone") || "alpha",
    budget: url.searchParams.get("budget") || "low",
    ship: url.searchParams.get("ship") || "",
  };
  try {
    json(res, 200, await recommendFits(query));
  } catch (error) {
    json(res, 200, { source: "demo", warning: error.message, fits: demoFits });
  }
}

async function handleFeedback(req, res) {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > 10000) req.destroy();
  });
  req.on("end", () => {
    console.log("feedback", body);
    json(res, 200, { ok: true });
  });
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const file = await readFile(filePath);
    res.writeHead(200, {
      "content-type": mimeTypes[extname(filePath)] || "application/octet-stream",
    });
    res.end(file);
  } catch {
    if (!extname(filePath)) {
      filePath = `${filePath}.html`;
      try {
        const file = await readFile(filePath);
        res.writeHead(200, {
          "content-type": mimeTypes[extname(filePath)] || "application/octet-stream",
        });
        res.end(file);
        return;
      } catch {
        // Fall through to 404.
      }
    }
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/health") return json(res, 200, { ok: true });
  if (req.url?.startsWith("/api/recommend")) return handleRecommend(req, res);
  if (req.url?.startsWith("/api/feedback") && req.method === "POST") return handleFeedback(req, res);
  return serveStatic(req, res);
});

server.listen(port, host, () => {
  console.log(`EVE Fit 推荐器 running at http://${host}:${port}`);
});
