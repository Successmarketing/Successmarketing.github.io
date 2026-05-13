#!/usr/bin/env node

/**
 * Google Search Console URL Inspection API — ask Google what it knows
 * about specific URLs: indexed? last crawl? canonical? coverage state?
 *
 * Usage:
 *   node scripts/gsc-inspect.mjs <url1> <url2> ...
 *   node scripts/gsc-inspect.mjs --top 10       # inspect top N sitemap URLs
 */

import { createSign } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const FALLBACK_SITE = "sc-domain:successmarketingkota.com";
const SITEMAP_PATH = "sitemap-core.xml";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SCOPES = "https://www.googleapis.com/auth/webmasters.readonly";

function parseArgs() {
  const a = process.argv.slice(2);
  const top = a.indexOf("--top");
  const topN = top !== -1 ? parseInt(a[top + 1], 10) : null;
  const site = a.indexOf("--site");
  const siteValue = site !== -1 ? a[site + 1] : FALLBACK_SITE;
  const urls = a.filter((x) => x.startsWith("http"));
  return { urls, topN, site: siteValue };
}

function loadServiceAccount() {
  const p = resolve(process.cwd(), ".secrets/gsc-service-account.json");
  if (!existsSync(p)) throw new Error(`Missing ${p}`);
  return JSON.parse(readFileSync(p, "utf8"));
}

function base64url(i) {
  return Buffer.from(typeof i === "string" ? i : JSON.stringify(i)).toString(
    "base64url"
  );
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
  if (!res.ok) throw new Error(`Token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function inspect(token, siteUrl, inspectionUrl) {
  const res = await fetch(
    "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inspectionUrl,
        siteUrl,
      }),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: `${res.status} ${JSON.stringify(data)}` };
  }
  return data;
}

function parseSitemap(filePath) {
  const xml = readFileSync(filePath, "utf-8");
  const urls = [];
  const regex = /<loc>([^<]+)<\/loc>/g;
  let m;
  while ((m = regex.exec(xml)) !== null) urls.push(m[1]);
  return urls;
}

async function main() {
  const args = parseArgs();
  let urls = args.urls;
  if (args.topN) {
    urls = parseSitemap(resolve(process.cwd(), SITEMAP_PATH)).slice(
      0,
      args.topN
    );
  }
  if (urls.length === 0) {
    console.error("Pass URLs as args or --top N");
    process.exit(1);
  }
  const sa = loadServiceAccount();
  const token = await getAccessToken(sa);

  for (const u of urls) {
    process.stdout.write(`\n${u}\n`);
    const r = await inspect(token, args.site, u);
    if (r.error) {
      console.log(`  ERROR: ${r.error}`);
      continue;
    }
    const index = r.inspectionResult?.indexStatusResult ?? {};
    console.log(`  verdict:            ${index.verdict ?? "—"}`);
    console.log(`  coverageState:      ${index.coverageState ?? "—"}`);
    console.log(`  robotsTxtState:     ${index.robotsTxtState ?? "—"}`);
    console.log(`  indexingState:      ${index.indexingState ?? "—"}`);
    console.log(`  pageFetchState:     ${index.pageFetchState ?? "—"}`);
    console.log(`  googleCanonical:    ${index.googleCanonical ?? "—"}`);
    console.log(`  userCanonical:      ${index.userCanonical ?? "—"}`);
    console.log(`  lastCrawlTime:      ${index.lastCrawlTime ?? "—"}`);
    console.log(`  crawledAs:          ${index.crawledAs ?? "—"}`);
    if (index.referringUrls?.length)
      console.log(`  referringUrls:      ${index.referringUrls.length}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
