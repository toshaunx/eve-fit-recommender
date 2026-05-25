import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const publicDir = join(root, "public");
const distDir = join(root, "dist");
const dataDir = join(distDir, "data");
const base = "https://webapi.eveworkbench.com";

function uniqueById(items) {
  const byId = new Map();
  for (const item of items) {
    if (item?.id && !byId.has(item.id)) byId.set(item.id, item);
  }
  return [...byId.values()];
}

async function getJson(pathname) {
  const response = await fetch(`${base}${pathname}`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`${pathname} returned ${response.status}`);
  return response.json();
}

async function fitLists() {
  const endpoints = [
    "/Fit/GetLatest?alpha=true",
    "/Fit/GetNewestFits",
    "/Fit/GetPopularFits",
    "/Fit/GetFitsByTag?tags=Exploration&popular=false",
    "/Fit/GetFitsByTag?tags=Abyss&popular=false",
    "/Fit/GetFitsByTag?tags=PVP&popular=false",
    "/Fit/GetFitsByTag?tags=Mining&popular=false",
    "/Fit/GetFitsByTag?tags=Hauling&popular=false",
  ];
  const results = await Promise.allSettled(endpoints.map(getJson));
  return uniqueById(results.flatMap((result) => (
    result.status === "fulfilled" && Array.isArray(result.value?.result) ? result.value.result : []
  )));
}

async function eftFor(id) {
  const data = await getJson(`/Fit/GetEftById?id=${encodeURIComponent(id)}&type=eft`);
  return data?.result?.eft || "";
}

async function buildFits() {
  const candidates = (await fitLists()).slice(0, 180);
  const fits = [];
  for (const fit of candidates) {
    try {
      const eft = await eftFor(fit.id);
      if (!eft.includes("[")) continue;
      fits.push({
        id: fit.id,
        name: fit.name,
        shipName: fit.shipName,
        shipClass: fit.shipClass,
        tags: (fit.tags || []).map((tag) => typeof tag === "string" ? tag : tag.name).filter(Boolean),
        totalCost: fit.totalCost,
        runs: fit.runs || 0,
        isAlphaUsable: Boolean(fit.isAlphaUsable),
        sourceUrl: `https://www.eveworkbench.com/fit/${fit.id}`,
        eft,
      });
    } catch {
      // Skip deleted or temporarily unavailable fits.
    }
  }
  return fits;
}

async function rewriteHtml(pathname) {
  const fullPath = join(distDir, pathname);
  let html = await readFile(fullPath, "utf8");
  html = html
    .replaceAll('href="/styles.css"', 'href="styles.css"')
    .replaceAll('src="/app.js"', 'src="app.js"')
    .replaceAll('href="/about"', 'href="about.html"')
    .replaceAll('href="/privacy"', 'href="privacy.html"')
    .replaceAll('href="/terms"', 'href="terms.html"')
    .replaceAll('href="/"', 'href="index.html"');
  await writeFile(fullPath, html);
}

await rm(distDir, { recursive: true, force: true });
await mkdir(dataDir, { recursive: true });
await cp(publicDir, distDir, { recursive: true });
await writeFile(join(dataDir, "fits.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  fits: await buildFits(),
}, null, 2));
await Promise.all(["index.html", "about.html", "privacy.html", "terms.html"].map(rewriteHtml));

console.log(`Built static site in ${distDir}`);
