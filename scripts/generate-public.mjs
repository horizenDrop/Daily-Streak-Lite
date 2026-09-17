import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const siteDir = resolve(root, "site");
const publicDir = resolve(root, "public");
const appUrl = resolveAppUrl();

await rm(publicDir, { recursive: true, force: true });
await mkdir(publicDir, { recursive: true });
await cp(siteDir, publicDir, { recursive: true });

const frameObject = {
  version: "next",
  imageUrl: `${appUrl}/og.svg`,
  button: {
    title: "Open Daily Streak",
    action: {
      type: "launch_frame",
      name: "Daily Streak Lite",
      url: appUrl,
      splashBackgroundColor: "#0b1220"
    }
  }
};

const indexPath = resolve(publicDir, "index.html");
const currentIndex = await readFile(indexPath, "utf8");
const embedPayload = escapeHtmlAttribute(JSON.stringify(frameObject));
const nextIndex = currentIndex.split("__FC_FRAME__").join(embedPayload);
await writeFile(indexPath, nextIndex, "utf8");

await writeFile(resolve(publicDir, "og.svg"), `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#0b1220"/><text x="50%" y="50%" fill="#ffffff" font-size="72" text-anchor="middle" dominant-baseline="middle">Daily Streak Lite</text></svg>`, "utf8");

function escapeHtmlAttribute(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("'", "&#39;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function resolveAppUrl() {
  const appUrl = normalizeHttpUrl(process.env.APP_URL);
  if (appUrl) return appUrl;

  const projectProductionUrl = normalizeHostLikeUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  if (projectProductionUrl) return projectProductionUrl;

  const vercelUrl = normalizeHostLikeUrl(process.env.VERCEL_URL);
  if (vercelUrl) return vercelUrl;

  return "https://daily-streak-lite.vercel.app";
}

function normalizeHttpUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function normalizeHostLikeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const host = raw.replace(/^https?:\/\//i, "").split("/")[0].trim();
  if (!host) return null;
  return `https://${host}`.replace(/\/$/, "");
}
