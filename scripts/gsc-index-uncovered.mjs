#!/usr/bin/env node

/**
 * One-shot GSC pipeline for successmarketingkota.com:
 *
 *   1. Submit every child sitemap to Google Search Console so Google
 *      re-crawls them (sitemap index + 4 child sitemaps).
 *   2. Walk all child sitemaps to enumerate every URL on the site.
 *   3. Call URL Inspection API for each URL to learn its index state.
 *   4. Persist a full report to .secrets/gsc-index-status.json.
 *   5. Hit the Indexing API (URL_UPDATED) for every URL that is NOT
 *      currently "Submitted and indexed", until the daily quota (~200)
 *      is exhausted. Freshest sitemap entries are pinged first.
 *
 * Usage:
 *   node scripts/gsc-index-uncovered.mjs                # full pipeline
 *   node scripts/gsc-index-uncovered.mjs --skip-submit  # skip sitemap submit
 *   node scripts/gsc-index-uncovered.mjs --skip-inspect # use cached report
 *   node scripts/gsc-index-uncovered.mjs --skip-index   # just produce report
 *   node scripts/gsc-index-uncovered.mjs --limit 200    # cap Indexing API calls
 *   node scripts/gsc-index-uncovered.mjs --inspect-limit 600
 */

import { createSign } from "node:crypto";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

const SITE = "sc-domain:successmarketingkota.com";
const ORIGIN = "https://successmarketingkota.com";
const SITEMAP_INDEX_URL = `${ORIGIN}/sitemap.xml`;
const CHILD_SITEMAPS = [
  "sitemap-core.xml",
  "sitemap-kota.xml",
  "sitemap-near-me.xml",
  "sitemap-blog.xml",
];

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SCOPES = [
  "https://www.googleapis.com/auth/webmasters",
  "https://www.googleapis.com/auth/indexing",
].join(" ");

const INSPECT_PAUSE_MS = 0;       // throttling done via concurrency window
const INSPECT_CONCURRENCY = 8;    // parallel URL Inspection calls
const INDEXING_PAUSE_MS = 200;
const INDEXING_DEFAULT_LIMIT = 200;
const REPORT_PATH = resolve(process.cwd(), ".secrets/gsc-index-status.json");

function parseArgs() {
  const a = process.argv.slice(2);
  const has = (f) => a.includes(f);
  const valOf = (f, def) => {
    const i = a.indexOf(f);
    return i !== -1 ? a[i + 1] : def;
  };
  return {
    skipSubmit: has("--skip-submit"),
    skipInspect: has("--skip-inspect"),
    skipIndex: has("--skip-index"),
    limit: parseInt(valOf("--limit", String(INDEXING_DEFAULT_LIMIT)), 10),
    inspectLimit: valOf("--inspect-limit", null)
      ? parseInt(valOf("--inspect-limit", null), 10)
      : null,
  };
}

function loadServiceAccount() {
  const jsonEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (jsonEnv) return JSON.parse(jsonEnv);
  const explicit = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const candidate =
    explicit ?? resolve(process.cwd(), ".secrets/gsc-service-account.json");
  if (!existsSync(candidate)) {
    throw new Error(`No service-account credentials found at ${candidate}`);
  }
  return JSON.parse(readFileSync(candidate, "utf8"));
}

function base64url(input) {
  return Buffer.from(
    typeof input === "string" ? input : JSON.stringify(input)
  ).toString("base64url");
}

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: sa.private_key_id };
  const claim = {
    iss: sa.client_email,
    scope: SCOPES,
    aud: TOKEN_ENDPOINT,
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${base64url(header)}.${base64url(claim)}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const sig = signer.sign(sa.private_key).toString("base64url");
  const jwt = `${signingInput}.${sig}`;
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`Token error (${res.status}): ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

async function submitSitemap(token, siteUrl, sitemapUrl) {
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
    siteUrl
  )}/sitemaps/${encodeURIComponent(sitemapUrl)}`;
  const res = await fetch(endpoint, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 200 || res.status === 204) return { ok: true };
  const body = await res.text();
  return { ok: false, status: res.status, body };
}

async function inspectUrl(token, siteUrl, inspectionUrl) {
  const res = await fetch(
    "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inspectionUrl, siteUrl }),
    }
  );
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function pingIndexing(token, url) {
  const res = await fetch(
    "https://indexing.googleapis.com/v3/urlNotifications:publish",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, type: "URL_UPDATED" }),
    }
  );
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function parseSitemapXml(xml) {
  const out = [];
  const re = /<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    out.push({ loc: m[1].trim(), lastmod: m[2] ? m[2].trim() : null });
  }
  return out;
}

function loadAllSitemapUrls() {
  const all = [];
  for (const path of CHILD_SITEMAPS) {
    const abs = resolve(process.cwd(), path);
    if (!existsSync(abs)) {
      console.warn(`  ! missing ${path}`);
      continue;
    }
    const entries = parseSitemapXml(readFileSync(abs, "utf8"));
    console.log(`  ${path}: ${entries.length} URLs`);
    for (const e of entries) all.push({ ...e, source: path });
  }
  // Deduplicate by URL, preferring the freshest lastmod.
  const map = new Map();
  for (const e of all) {
    const prev = map.get(e.loc);
    const ts = e.lastmod ? Date.parse(e.lastmod) : 0;
    const pts = prev?.lastmod ? Date.parse(prev.lastmod) : 0;
    if (!prev || ts > pts) map.set(e.loc, e);
  }
  return [...map.values()];
}

function classify(insp) {
  const idx = insp?.inspectionResult?.indexStatusResult ?? {};
  const verdict = idx.verdict ?? "UNKNOWN";
  const coverage = idx.coverageState ?? "";
  const isIndexed =
    verdict === "PASS" ||
    /Submitted and indexed/i.test(coverage) ||
    /Indexed/i.test(coverage);
  return {
    verdict,
    coverageState: coverage,
    robotsTxtState: idx.robotsTxtState ?? null,
    indexingState: idx.indexingState ?? null,
    pageFetchState: idx.pageFetchState ?? null,
    googleCanonical: idx.googleCanonical ?? null,
    userCanonical: idx.userCanonical ?? null,
    lastCrawlTime: idx.lastCrawlTime ?? null,
    crawledAs: idx.crawledAs ?? null,
    isIndexed,
  };
}

function loadCachedReport() {
  if (!existsSync(REPORT_PATH)) return null;
  try {
    return JSON.parse(readFileSync(REPORT_PATH, "utf8"));
  } catch {
    return null;
  }
}

function saveReport(report) {
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\nReport saved: ${REPORT_PATH}`);
}

function header(s) {
  console.log(`\n${"=".repeat(70)}\n${s}\n${"=".repeat(70)}`);
}

async function main() {
  const args = parseArgs();
  const sa = loadServiceAccount();
  console.log(`Site:            ${SITE}`);
  console.log(`Service account: ${sa.client_email}`);
  const token = await getAccessToken(sa);
  console.log("Access token obtained.");

  // 1) Submit sitemaps
  if (!args.skipSubmit) {
    header("STEP 1 — Submit sitemaps to GSC");
    const sitemapUrls = [
      SITEMAP_INDEX_URL,
      ...CHILD_SITEMAPS.map((p) => `${ORIGIN}/${p}`),
    ];
    for (const url of sitemapUrls) {
      const r = await submitSitemap(token, SITE, url);
      console.log(
        r.ok
          ? `  OK   ${url}`
          : `  FAIL (${r.status}) ${url} :: ${r.body?.slice(0, 200)}`
      );
    }
  } else {
    header("STEP 1 — skipped (--skip-submit)");
  }

  // 2) Build URL list, freshest first
  header("STEP 2 — Enumerate URLs from child sitemaps");
  let entries = loadAllSitemapUrls();
  entries.sort((a, b) => {
    const ta = a.lastmod ? Date.parse(a.lastmod) : 0;
    const tb = b.lastmod ? Date.parse(b.lastmod) : 0;
    return tb - ta;
  });
  console.log(`Total unique URLs: ${entries.length}`);
  if (args.inspectLimit) {
    entries = entries.slice(0, args.inspectLimit);
    console.log(`Capped to first ${entries.length} (--inspect-limit)`);
  }

  // 3) Inspect each URL
  let report;
  if (args.skipInspect) {
    header("STEP 3 — skipped (--skip-inspect), using cached report");
    report = loadCachedReport();
    if (!report) {
      console.error("No cached report found, cannot skip inspection.");
      process.exit(1);
    }
  } else {
    header(
      `STEP 3 — Inspect ${entries.length} URLs (concurrency ${INSPECT_CONCURRENCY})`
    );
    const results = new Array(entries.length);
    let indexed = 0;
    let nonIndexed = 0;
    let errors = 0;
    let cursor = 0;
    let completed = 0;
    let stop = false;
    const startedAt = Date.now();

    async function worker() {
      while (!stop) {
        const i = cursor++;
        if (i >= entries.length) return;
        const e = entries[i];
        const r = await inspectUrl(token, SITE, e.loc);
        if (!r.ok) {
          errors++;
          const msg = r.data?.error?.message ?? "";
          if (r.status === 429 || /quota/i.test(msg)) {
            console.error(
              `  ! quota exceeded after ${completed} URL(s): ${msg} — stopping`
            );
            stop = true;
            results[i] = {
              url: e.loc,
              lastmod: e.lastmod,
              source: e.source,
              error: `${r.status} ${msg}`,
            };
            return;
          }
          results[i] = {
            url: e.loc,
            lastmod: e.lastmod,
            source: e.source,
            error: `${r.status} ${msg}`,
          };
        } else {
          const cls = classify(r.data);
          results[i] = {
            url: e.loc,
            lastmod: e.lastmod,
            source: e.source,
            ...cls,
          };
          if (cls.isIndexed) indexed++;
          else nonIndexed++;
        }
        completed++;
        if (completed % 25 === 0 || completed === entries.length) {
          const sec = ((Date.now() - startedAt) / 1000).toFixed(0);
          const rate = (completed / Math.max(1, sec)).toFixed(2);
          console.log(
            `  [${completed}/${entries.length}] ${sec}s elapsed @ ${rate} URL/s — ✓${indexed} ✗${nonIndexed} err${errors}`
          );
        }
        if (INSPECT_PAUSE_MS) {
          await new Promise((r) => setTimeout(r, INSPECT_PAUSE_MS));
        }
      }
    }

    await Promise.all(
      Array.from({ length: INSPECT_CONCURRENCY }, () => worker())
    );

    // Compact array (skip undefined holes from early termination).
    const compact = results.filter((x) => x !== undefined);

    report = {
      site: SITE,
      generatedAt: new Date().toISOString(),
      totals: {
        examined: compact.length,
        indexed,
        nonIndexed,
        errors,
      },
      results: compact,
    };
    saveReport(report);
    console.log(
      `\nInspection summary — examined ${compact.length} | indexed ${indexed} | non-indexed ${nonIndexed} | errors ${errors}`
    );
  }

  // 4) Submit non-indexed URLs to Indexing API
  const nonIndexed = (report.results ?? []).filter(
    (r) => r.isIndexed === false && !r.error
  );
  // Freshest first.
  nonIndexed.sort((a, b) => {
    const ta = a.lastmod ? Date.parse(a.lastmod) : 0;
    const tb = b.lastmod ? Date.parse(b.lastmod) : 0;
    return tb - ta;
  });

  if (args.skipIndex) {
    header("STEP 4 — skipped (--skip-index)");
    console.log(`${nonIndexed.length} non-indexed URL(s) found.`);
    if (nonIndexed.length) {
      console.log("First 10:");
      nonIndexed.slice(0, 10).forEach((r) => console.log(`  - ${r.url}`));
    }
    return;
  }

  header(
    `STEP 4 — Ping Indexing API for ${Math.min(
      nonIndexed.length,
      args.limit
    )} non-indexed URL(s) (cap ${args.limit})`
  );
  if (nonIndexed.length === 0) {
    console.log("Nothing to do — every examined URL is already indexed.");
    return;
  }

  const toSend = nonIndexed.slice(0, args.limit);
  let ok = 0;
  let quotaExceeded = false;
  const indexingResults = [];
  for (let i = 0; i < toSend.length; i++) {
    const target = toSend[i];
    const r = await pingIndexing(token, target.url);
    if (r.ok) {
      ok++;
      indexingResults.push({ url: target.url, status: "OK" });
    } else {
      const msg = r.data?.error?.message ?? "";
      indexingResults.push({
        url: target.url,
        status: `ERR ${r.status}`,
        message: msg,
      });
      if (r.status === 429 || /quota/i.test(msg)) {
        console.error(`  ! quota exceeded after ${ok}: ${msg}`);
        quotaExceeded = true;
        break;
      }
      console.error(`  ${r.status} ${msg} — ${target.url}`);
    }
    if ((i + 1) % 20 === 0)
      console.log(`  …${i + 1}/${toSend.length} pinged (${ok} ok)`);
    await new Promise((r) => setTimeout(r, INDEXING_PAUSE_MS));
  }

  console.log(
    `\nIndexing API done: ${ok}/${toSend.length} succeeded${
      quotaExceeded ? " (stopped early, daily quota hit)" : ""
    }`
  );

  // Persist updated report with the indexing result snapshot.
  report.indexingRun = {
    ranAt: new Date().toISOString(),
    attempted: toSend.length,
    succeeded: ok,
    quotaExceeded,
    results: indexingResults,
  };
  saveReport(report);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
