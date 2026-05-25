import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const workbenchBase = "https://webapi.eveworkbench.com";
const cache = new Map();

const demoFits = [
  {
    id: "demo-heron",
    title: "Heron Alpha Relic/Data Starter",
    ship: "Heron",
    activity: "exploration",
    score: 88,
    source: "Demo fallback",
    tags: ["Exploration", "Low budget"],
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
    id: "demo-caracal",
    title: "Caracal Alpha Level 2 Mission",
    ship: "Caracal",
    activity: "pve",
    score: 82,
    source: "Demo fallback",
    tags: ["PVE", "Low budget"],
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
    id: "demo-venture",
    title: "Venture Beginner Mining",
    ship: "Venture",
    activity: "mining",
    score: 79,
    source: "Demo fallback",
    tags: ["Mining", "Low budget"],
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

function cached(key) {
  const hit = cache.get(key);
  return hit && hit.expires > Date.now() ? hit.value : null;
}

function remember(key, value, ttlMs = 15 * 60 * 1000) {
  cache.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

async function workbench(pathname) {
  const hit = cached(pathname);
  if (hit) return hit;
  const response = await fetch(`${workbenchBase}${pathname}`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Workbench returned ${response.status}`);
  return remember(pathname, await response.json());
}

function list(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.result)) return payload.result;
  return [];
}

function text(value) {
  return String(value || "").toLowerCase();
}

function tags(fit) {
  return (fit.tags || []).map((tag) => typeof tag === "string" ? tag : tag.name).filter(Boolean);
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

async function candidates(query) {
  const requests = [
    workbench("/Fit/GetLatest?alpha=true"),
    workbench("/Fit/GetNewestFits"),
    workbench("/Fit/GetPopularFits"),
    ...activityTags(query.activity).slice(0, 2).map((tag) =>
      workbench(`/Fit/GetFitsByTag?tags=${encodeURIComponent(tag)}&popular=false`)
    ),
  ];
  const settled = await Promise.allSettled(requests);
  const byId = new Map();
  for (const item of settled) {
    if (item.status !== "fulfilled") continue;
    for (const fit of list(item.value)) {
      if (fit.id && !byId.has(fit.id)) byId.set(fit.id, fit);
    }
  }
  return [...byId.values()];
}

async function eftFor(id) {
  const data = await workbench(`/Fit/GetEftById?id=${encodeURIComponent(id)}&type=eft`);
  return data?.result?.eft || "";
}

function score(fit, eft, query) {
  const haystack = text([fit.name, fit.shipName, fit.shipClass, tags(fit).join(" "), eft].join(" "));
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
  if (/x\d+/i.test(eft)) value += 4;
  return Math.round(Math.max(0, Math.min(100, value)));
}

function reason(fit, query, value) {
  const activity = {
    pve: "PVE 刷怪/任务",
    pvp: "PVP",
    exploration: "探索",
    mining: "挖矿",
    abyss: "深渊",
    hauling: "运输",
  }[query.activity] || "当前玩法";
  const quality = value >= 70 ? "匹配度较高，可以作为第一套候选。" : "匹配度一般，建议先看装备和技能要求。";
  const cost = typeof fit.totalCost === "number" ? `估价约 ${formatIsk(fit.totalCost)}。` : "";
  const alpha = fit.isAlphaUsable ? "标记为 Alpha 可用。" : "未标记为 Alpha 可用，复制前要确认技能。";
  const runs = fit.runs ? `Workbench 记录了 ${fit.runs} 次相关运行/使用数据。` : "";
  return `${fit.shipName || "这艘船"} 的这套配置和「${activity}」方向相关。${quality} ${cost}${alpha} ${runs}`.trim();
}

function displayTags(fit, query, eft) {
  const output = tags(fit).slice(0, 4);
  if (fit.isAlphaUsable) output.unshift("Alpha 可用");
  if (typeof fit.totalCost === "number") output.push(formatIsk(fit.totalCost));
  if (query.budget === "low") output.push("低预算");
  if (/\bii\b/i.test(eft)) output.push("含 T2 装备");
  if (/probe|relic|data/i.test(eft)) output.push("扫描/探索");
  if (/missile|launcher/i.test(eft)) output.push("导弹");
  return [...new Set(output)].slice(0, 6);
}

async function recommend(query) {
  const all = await candidates(query);
  const ship = text(query.ship);
  const keywords = activityKeywords(query.activity);
  const rough = all.filter((fit) => {
    const haystack = text([fit.name, fit.shipName, fit.shipClass, tags(fit).join(" ")].join(" "));
    if (ship && !haystack.includes(ship)) return false;
    return !keywords.length
      || keywords.some((keyword) => haystack.includes(keyword))
      || activityTags(query.activity).some((tag) => haystack.includes(text(tag)));
  });

  const selected = (rough.length ? rough : all).slice(0, 24);
  const enriched = [];
  for (const fit of selected) {
    try {
      const eft = await eftFor(fit.id);
      if (!eft || !eft.includes("[")) continue;
      const value = score(fit, eft, query);
      enriched.push({
        id: fit.id,
        title: fit.name ? `${fit.name} (${fit.shipClass || "Ship"} - ${fit.shipName})` : fit.shipName,
        ship: fit.shipName || "Unknown ship",
        score: value,
        source: "EVE Workbench",
        sourceUrl: `https://www.eveworkbench.com/fit/${fit.id}`,
        tags: displayTags(fit, query, eft),
        reason: reason(fit, query, value),
        eft,
      });
    } catch {
      // Individual public fits can disappear or fail to export.
    }
  }
  return enriched.sort((a, b) => b.score - a.score).slice(0, 3);
}

function demo(query) {
  const activity = text(query.activity);
  const ship = text(query.ship);
  return demoFits
    .map((fit) => ({
      ...fit,
      score: Math.max(0, Math.min(100,
        fit.score
        + (activity && fit.activity === activity ? 10 : 0)
        + (ship && text(fit.ship).includes(ship) ? 16 : 0)
        - (ship && !text(fit.ship).includes(ship) ? 12 : 0)
      )),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
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
    const fits = await recommend(query);
    if (fits.length) return json(res, 200, { source: "eve-workbench", fits });
    json(res, 200, { source: "demo", warning: "未匹配到真实 Fit，当前显示演示数据。", fits: demo(query) });
  } catch (error) {
    json(res, 200, { source: "demo", warning: "Fit 仓库暂时不可用，当前显示演示数据。", fits: demo(query) });
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
  const candidates = [join(publicDir, safePath)];
  if (!extname(safePath)) candidates.push(join(publicDir, `${safePath}.html`));

  for (const filePath of candidates) {
    if (!filePath.startsWith(publicDir)) break;
    try {
      const file = await readFile(filePath);
      res.writeHead(200, { "content-type": mimeTypes[extname(filePath)] || "application/octet-stream" });
      res.end(file);
      return;
    } catch {
      // Try the next candidate.
    }
  }
  res.writeHead(404);
  res.end("Not found");
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") return json(res, 200, { ok: true });
  if (req.url?.startsWith("/api/recommend")) return handleRecommend(req, res);
  if (req.url?.startsWith("/api/feedback") && req.method === "POST") return handleFeedback(req, res);
  return serveStatic(req, res);
});

server.listen(port, host, () => {
  console.log(`EVE Fit 推荐器 running at http://${host}:${port}`);
});
