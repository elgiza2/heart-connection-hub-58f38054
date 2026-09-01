#!/usr/bin/env node
/**
 * Generates public/sitemap.xml from the app's public route list.
 * Run: node scripts/generate-sitemap.mjs
 * Keep this in sync when adding public routes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE_URL = "https://megsyai.com";

// Locales the marketing site publishes in (mirrors src/lib/siteLangs.ts).
const LOCALES = [
  "es", "fr", "de", "pt", "it", "nl", "pl", "sv", "cs", "ro", "el",
  "ru", "uk", "tr", "ar", "he", "fa", "hi", "id", "vi", "th", "ja", "ko", "zh",
];

// Public, indexable routes (no auth, no params).
const STATIC_ROUTES = [
  ["/", "1.0", "daily"],
  ["/pricing", "0.9", "weekly"],
  ["/about", "0.6", "monthly"],
  ["/features", "0.8", "weekly"],
  ["/features-guide", "0.7", "monthly"],
  ["/enterprise", "0.7", "monthly"],
  ["/models", "0.8", "weekly"],
  ["/megsy-model", "0.7", "monthly"],
  ["/ai-chat", "0.8", "weekly"],
  ["/apps", "0.6", "weekly"],
  ["/gallery", "0.6", "weekly"],
  ["/showcase", "0.6", "weekly"],
  ["/solutions", "0.7", "weekly"],
  ["/compare", "0.7", "weekly"],
  ["/changelog", "0.5", "weekly"],
  ["/contact", "0.5", "monthly"],
  ["/security", "0.5", "monthly"],
  ["/compliance", "0.4", "yearly"],
  ["/privacy", "0.4", "yearly"],
  ["/refund", "0.4", "yearly"],
  ["/cookies", "0.3", "yearly"],
  ["/acceptable-use", "0.3", "yearly"],
  ["/policies/content", "0.3", "yearly"],
  ["/legal/dmca", "0.3", "yearly"],
  ["/legal/dpa", "0.3", "yearly"],
  ["/legal/affiliate", "0.3", "yearly"],
  ["/legal/ai-disclaimer", "0.3", "yearly"],
  ["/legal/accessibility", "0.3", "yearly"],
  ["/legal/age", "0.3", "yearly"],
  ["/legal/moderation", "0.3", "yearly"],
  ["/legal/subprocessors", "0.3", "yearly"],
  ["/referrals", "0.5", "monthly"],
];

function slugsFrom(file, arrayName) {
  try {
    const src = readFileSync(resolve(root, file), "utf8");
    const body = src.slice(src.indexOf(arrayName));
    return [...body.matchAll(/slug:\s*"([^"]+)"/g)].map((m) => m[1]);
  } catch {
    return [];
  }
}

const comparisonSlugs = slugsFrom("src/data/comparisons.ts", "COMPARISONS");

const entries = [];
const seen = new Set();
const push = (path, priority, changefreq, alternates = false) => {
  if (seen.has(path)) return;
  seen.add(path);
  entries.push({ path, priority, changefreq, alternates });
};

for (const [path, priority, changefreq] of STATIC_ROUTES) push(path, priority, changefreq, true);
for (const slug of comparisonSlugs) push(`/compare/megsy-vs-${slug}`, "0.6", "monthly");

// Localised marketing landings (/{lang}) — one entry per published locale.
for (const lang of LOCALES) push(`/${lang}`, "0.7", "weekly");

const xmlFor = (e) => {
  const loc = `${BASE_URL}${e.path === "/" ? "/" : e.path}`;
  const lines = [
    "  <url>",
    `    <loc>${loc}</loc>`,
    `    <changefreq>${e.changefreq}</changefreq>`,
    `    <priority>${e.priority}</priority>`,
  ];
  if (e.alternates) {
    lines.push(
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${loc}"/>`,
      `    <xhtml:link rel="alternate" hreflang="en" href="${loc}"/>`,
    );
    for (const lang of LOCALES) {
      const localised = e.path === "/" ? `${BASE_URL}/${lang}` : `${BASE_URL}/${lang}${e.path}`;
      lines.push(`    <xhtml:link rel="alternate" hreflang="${lang}" href="${localised}"/>`);
    }
  }
  lines.push("  </url>");
  return lines.join("\n");
};

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  ...entries.map(xmlFor),
  "</urlset>",
  "",
].join("\n");

writeFileSync(resolve(root, "public/sitemap.xml"), xml);
console.log(`sitemap.xml written — ${entries.length} URLs`);
