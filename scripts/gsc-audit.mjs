#!/usr/bin/env node

/**
 * Google Search Console audit for antiagingcare.org.
 *
 * Uses the same service-account credential loading as gsc-submit.mjs and
 * pulls real GSC data to highlight actionable SEO issues:
 *
 *   - Sitemap status (submitted, lastDownloaded, errors/warnings, indexed).
 *   - Top pages (last 28 days) with impressions and CTR.
 *   - Low-CTR pages (impressions >= threshold, ctr < threshold).
 *   - "Striking distance" queries (position 5-20) where a small nudge moves
 *     the page onto page 1 or into the top 3.
 *   - Pages ranking on page 2 (position 11-20) with impressions but 0 clicks.
 *
 * Output is printed to stdout as a human-readable report and also written
 * to .secrets/gsc-audit-latest.json for subsequent automation.
 *
 * Flags
 * -----
 *   --days N              Lookback window (default 28)
 *   --ctr-threshold F     Low-CTR threshold 0..1 (default 0.02)
 *   --impr-threshold N    Minimum impressions to consider (default 100)
 *   --limit N             Row cap per query (default 500)
 *   --site <id>           Override GSC property (default sc-domain:antiagingcare.org)
 *   --json                Print full JSON instead of report
 */

import { createSign } from "node:crypto";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

const FALLBACK_SITE = "sc-domain:successmarketingkota.com";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SCOPES = "https://www.googleapis.com/auth/webmasters.readonly";

function parseArgs() {
  const a = process.argv.slice(2);
  const val = (flag, def) => {
    const i = a.indexOf(flag);
    return i !== -1 ? a[i + 1] : def;
  };
  return {
    days: parseInt(val("--days", "28"), 10),
    ctrThreshold: parseFloat(val("--ctr-threshold", "0.02")),
    imprThreshold: parseInt(val("--impr-threshold", "100"), 10),
    limit: parseInt(val("--limit", "500"), 10),
    site: val("--site", FALLBACK_SITE),
    json: a.includes("--json"),
  };
}

function loadServiceAccount() {
  const jsonEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (jsonEnv) return JSON.parse(jsonEnv);
  const explicitPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const candidate =
    explicitPath ?? resolve(process.cwd(), ".secrets/gsc-service-account.json");
  if (!existsSync(candidate)) {
    throw new Error(
      `No Google service account credentials found at ${candidate}`
    );
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
  const signature = signer.sign(sa.private_key).toString("base64url");
  const jwt = `${signingInput}.${signature}`;
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
    throw new Error(`Token exchange failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

function isoDaysAgo(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function gsc(token, path, body) {
  const url = `https://www.googleapis.com/webmasters/v3${path}`;
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `GSC ${path} failed (${res.status}): ${JSON.stringify(data)}`
    );
  }
  return data;
}

async function listSitemaps(token, site) {
  return gsc(token, `/sites/${encodeURIComponent(site)}/sitemaps`);
}

async function searchAnalytics(token, site, body) {
  return gsc(
    token,
    `/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
    body
  );
}

function pct(n) {
  return `${(n * 100).toFixed(2)}%`;
}

function fmtRow(row) {
  return {
    keys: row.keys,
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0,
  };
}

function section(title) {
  console.log(`\n${"=".repeat(70)}\n${title}\n${"=".repeat(70)}`);
}

async function main() {
  const args = parseArgs();
  const sa = loadServiceAccount();
  const token = await getAccessToken(sa);

  const endDate = isoDaysAgo(1);
  const startDate = isoDaysAgo(args.days + 1);

  console.log(`GSC property: ${args.site}`);
  console.log(`Service account: ${sa.client_email}`);
  console.log(`Window: ${startDate} → ${endDate} (${args.days} days)\n`);

  const sitemaps = await listSitemaps(token, args.site).catch((e) => ({
    error: e.message,
  }));

  section("SITEMAPS");
  if (sitemaps.error) {
    console.log(`Error: ${sitemaps.error}`);
  } else if (!sitemaps.sitemap || sitemaps.sitemap.length === 0) {
    console.log("No sitemaps registered with GSC.");
  } else {
    for (const s of sitemaps.sitemap) {
      const submitted = s.contents?.[0];
      console.log(`- ${s.path}`);
      console.log(`    lastSubmitted:  ${s.lastSubmitted ?? "—"}`);
      console.log(`    lastDownloaded: ${s.lastDownloaded ?? "—"}`);
      console.log(`    isPending:      ${s.isPending ?? false}`);
      console.log(`    errors:         ${s.errors ?? 0}`);
      console.log(`    warnings:       ${s.warnings ?? 0}`);
      if (submitted) {
        console.log(
          `    submitted/indexed: ${submitted.submitted ?? "—"} / ${
            submitted.indexed ?? "—"
          } (${submitted.type})`
        );
      }
    }
  }

  const bodyBase = {
    startDate,
    endDate,
    rowLimit: args.limit,
    dataState: "final",
  };

  const byPage = await searchAnalytics(token, args.site, {
    ...bodyBase,
    dimensions: ["page"],
  });
  const byQuery = await searchAnalytics(token, args.site, {
    ...bodyBase,
    dimensions: ["query"],
  });
  const byPageQuery = await searchAnalytics(token, args.site, {
    ...bodyBase,
    dimensions: ["page", "query"],
    rowLimit: Math.min(args.limit * 2, 2000),
  });

  const pages = (byPage.rows ?? []).map(fmtRow);
  const queries = (byQuery.rows ?? []).map(fmtRow);
  const pageQueries = (byPageQuery.rows ?? []).map(fmtRow);

  const totalClicks = pages.reduce((s, r) => s + r.clicks, 0);
  const totalImpr = pages.reduce((s, r) => s + r.impressions, 0);
  const overallCtr = totalImpr ? totalClicks / totalImpr : 0;

  section("TOTALS");
  console.log(`Pages with impressions: ${pages.length}`);
  console.log(`Total clicks:           ${totalClicks}`);
  console.log(`Total impressions:      ${totalImpr}`);
  console.log(`Overall CTR:            ${pct(overallCtr)}`);

  section(`TOP 20 PAGES BY IMPRESSIONS`);
  pages
    .slice()
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 20)
    .forEach((r) => {
      console.log(
        `${String(r.impressions).padStart(6)} impr  ` +
          `${String(r.clicks).padStart(4)} clk  ` +
          `${pct(r.ctr).padStart(7)} ctr  ` +
          `pos ${r.position.toFixed(1).padStart(5)}  ${r.keys[0]}`
      );
    });

  section(
    `LOW-CTR PAGES (impr ≥ ${args.imprThreshold}, ctr < ${pct(
      args.ctrThreshold
    )})`
  );
  const lowCtr = pages
    .filter(
      (r) => r.impressions >= args.imprThreshold && r.ctr < args.ctrThreshold
    )
    .sort((a, b) => b.impressions - a.impressions);
  if (lowCtr.length === 0) {
    console.log("None.");
  } else {
    lowCtr.slice(0, 30).forEach((r) => {
      console.log(
        `${String(r.impressions).padStart(6)} impr  ` +
          `${String(r.clicks).padStart(4)} clk  ` +
          `${pct(r.ctr).padStart(7)} ctr  ` +
          `pos ${r.position.toFixed(1).padStart(5)}  ${r.keys[0]}`
      );
    });
  }

  section(`STRIKING-DISTANCE QUERIES (position 5–20, impr ≥ 20)`);
  const striking = queries
    .filter((r) => r.position >= 5 && r.position <= 20 && r.impressions >= 20)
    .sort((a, b) => b.impressions - a.impressions);
  striking.slice(0, 30).forEach((r) => {
    console.log(
      `${String(r.impressions).padStart(6)} impr  ` +
        `${String(r.clicks).padStart(4)} clk  ` +
        `pos ${r.position.toFixed(1).padStart(5)}  "${r.keys[0]}"`
    );
  });
  if (striking.length === 0) console.log("None.");

  section(`PAGE-2 PAGES WITH 0 CLICKS (pos 11–20, impr ≥ ${args.imprThreshold})`);
  const page2 = pages
    .filter(
      (r) =>
        r.position >= 11 &&
        r.position <= 20 &&
        r.impressions >= args.imprThreshold &&
        r.clicks === 0
    )
    .sort((a, b) => b.impressions - a.impressions);
  if (page2.length === 0) console.log("None.");
  else
    page2.slice(0, 20).forEach((r) => {
      console.log(
        `${String(r.impressions).padStart(6)} impr  pos ${r.position
          .toFixed(1)
          .padStart(5)}  ${r.keys[0]}`
      );
    });

  // Per-page best query (to aid title/desc rewrites)
  const bestQueryByPage = new Map();
  for (const r of pageQueries) {
    const [page, query] = r.keys;
    const prev = bestQueryByPage.get(page);
    if (!prev || r.impressions > prev.impressions) {
      bestQueryByPage.set(page, { query, ...r });
    }
  }

  const outPath = resolve(process.cwd(), ".secrets/gsc-audit-latest.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        site: args.site,
        startDate,
        endDate,
        totals: { clicks: totalClicks, impressions: totalImpr, ctr: overallCtr },
        sitemaps: sitemaps.sitemap ?? [],
        pages,
        queries,
        pageQueries,
        lowCtr,
        striking,
        page2,
        bestQueryByPage: Object.fromEntries(bestQueryByPage),
      },
      null,
      2
    )
  );
  console.log(`\nFull report written to ${outPath}`);

  if (args.json) console.log(JSON.stringify({ pages, queries }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
