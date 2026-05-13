#!/usr/bin/env node

/**
 * Google Search Console + Indexing API automation.
 *
 * What it does
 * ------------
 *   1. Submits the sitemap to Google Search Console so Google re-crawls it.
 *   2. (Optional) Calls Google's Indexing API to notify Google of URL
 *      additions/updates. Default quota is ~200 URLs/day.
 *
 * Zero external dependencies: Node's built-in `crypto` + `fetch` sign the
 * JWT, exchange it for an access token, and call the REST APIs.
 *
 * Configuration (in priority order)
 * ---------------------------------
 *   1. CLI flags (see below)
 *   2. Environment variables: GSC_SITE, GSC_SITEMAP_URL, GSC_SITEMAP_PATH
 *   3. `gsc.config.json` in the repo root with keys:
 *        { "site": "sc-domain:example.com",
 *          "sitemapUrl": "https://example.com/sitemap.xml",
 *          "sitemapPath": "./sitemap.xml" }
 *   4. Hard-coded fallbacks at the top of this file.
 *
 * Credentials (in priority order)
 * -------------------------------
 *   1. GOOGLE_APPLICATION_CREDENTIALS_JSON  (full JSON content; use in CI)
 *   2. GOOGLE_APPLICATION_CREDENTIALS       (absolute path to key file)
 *   3. .secrets/gsc-service-account.json    (local dev default, gitignored)
 *
 * One-time setup
 * --------------
 *   1. Google Cloud Console: create a project and enable
 *        - "Google Search Console API"
 *        - "Indexing API"   (only needed for URL-level pings)
 *   2. Create a service account, download its JSON key.
 *   3. In Google Search Console -> Settings -> Users and permissions,
 *      add the service-account email with "Owner" permission (required
 *      for both sitemap submission AND Indexing API).
 *   4. Save the JSON key locally at .secrets/gsc-service-account.json
 *      (gitignored) OR set GOOGLE_APPLICATION_CREDENTIALS_JSON to the
 *      full JSON content (use GitHub Actions secrets for CI).
 *
 * Usage
 * -----
 *   node scripts/gsc-submit.mjs --sitemap
 *   node scripts/gsc-submit.mjs --sitemap --indexing --recent 7
 *   node scripts/gsc-submit.mjs --indexing --urls https://example.com/a
 *   node scripts/gsc-submit.mjs --sitemap --indexing --recent 7 --dry-run
 *
 * Flags
 * -----
 *   --sitemap          Submit the sitemap to GSC
 *   --indexing         Use the Indexing API (needs Owner-level GSC access)
 *   --recent N         Only URLs with <lastmod> within last N days
 *   --urls <u1> <u2>   Explicit URL list (overrides sitemap parsing)
 *   --dry-run          Print planned calls without executing
 *   --site <id>        Override GSC property identifier
 *   --sitemap-url <u>  Override sitemap URL
 *   --sitemap-path <p> Override local sitemap path
 *   --limit N          Cap Indexing API calls (default 190, under 200/day quota)
 */

import { createSign } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const FALLBACK_SITE = "sc-domain:successmarketingkota.com";
const FALLBACK_SITEMAP_URL = "https://successmarketingkota.com/sitemap.xml";
// Static GitHub Pages site — sitemaps live at the repo root.
const FALLBACK_SITEMAP_PATHS = [
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
const INDEXING_DEFAULT_LIMIT = 190;
const INDEXING_PAUSE_MS = 200;

function loadConfigFile() {
  const configPath = resolve(process.cwd(), "gsc.config.json");
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, "utf8"));
  } catch (err) {
    console.warn(`Ignoring gsc.config.json (invalid JSON): ${err.message}`);
    return {};
  }
}

function resolveConfig(cliOverrides) {
  const file = loadConfigFile();
  return {
    site:
      cliOverrides.site ??
      process.env.GSC_SITE ??
      file.site ??
      FALLBACK_SITE,
    sitemapUrl:
      cliOverrides.sitemapUrl ??
      process.env.GSC_SITEMAP_URL ??
      file.sitemapUrl ??
      FALLBACK_SITEMAP_URL,
    sitemapPath:
      cliOverrides.sitemapPath ??
      process.env.GSC_SITEMAP_PATH ??
      file.sitemapPath ??
      // Probe FALLBACK_SITEMAP_PATHS in order; first existing wins.
      // If none exist, return the first candidate so the caller's existsSync
      // check produces a sensible error message.
      FALLBACK_SITEMAP_PATHS.find((p) =>
        existsSync(resolve(process.cwd(), p))
      ) ??
      FALLBACK_SITEMAP_PATHS[0],
  };
}

function loadServiceAccount() {
  const jsonEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (jsonEnv) {
    try {
      return JSON.parse(jsonEnv);
    } catch (err) {
      throw new Error(
        `GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON: ${err.message}`
      );
    }
  }

  const explicitPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const candidate =
    explicitPath ?? resolve(process.cwd(), ".secrets/gsc-service-account.json");

  if (!existsSync(candidate)) {
    throw new Error(
      [
        "",
        "No Google service account credentials found.",
        "",
        "Set one of:",
        "  GOOGLE_APPLICATION_CREDENTIALS_JSON=<full json>   (recommended for CI)",
        "  GOOGLE_APPLICATION_CREDENTIALS=/abs/path/to/key.json",
        "",
        "Or save the JSON key at:",
        "  .secrets/gsc-service-account.json",
        "",
        "See the setup section at the top of scripts/gsc-submit.mjs.",
        "",
      ].join("\n")
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
    throw new Error(
      `Token exchange failed (${res.status}): ${JSON.stringify(data)}`
    );
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
  if (res.status === 200 || res.status === 204) return;
  const body = await res.text();
  throw new Error(`Sitemap submit failed (${res.status}): ${body}`);
}

async function pingIndexingAPI(token, url) {
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

function parseSitemap(filePath) {
  const xml = readFileSync(filePath, "utf-8");
  const entries = [];
  const urlRegex =
    /<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g;
  let match;
  while ((match = urlRegex.exec(xml)) !== null) {
    entries.push({ loc: match[1], lastmod: match[2] ?? null });
  }
  return entries;
}

function filterRecent(entries, days) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return entries.filter((e) => e.lastmod && new Date(e.lastmod) >= cutoff);
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const has = (flag) => argv.includes(flag);
  const valueOf = (flag) => {
    const i = argv.indexOf(flag);
    return i !== -1 ? argv[i + 1] : null;
  };
  const urlsIdx = argv.indexOf("--urls");
  const urls =
    urlsIdx !== -1
      ? argv.slice(urlsIdx + 1).filter((a) => a.startsWith("http"))
      : null;

  return {
    doSitemap: has("--sitemap"),
    doIndexing: has("--indexing"),
    recent: valueOf("--recent") ? parseInt(valueOf("--recent"), 10) : null,
    dryRun: has("--dry-run"),
    site: valueOf("--site"),
    sitemapUrl: valueOf("--sitemap-url"),
    sitemapPath: valueOf("--sitemap-path"),
    limit: valueOf("--limit")
      ? parseInt(valueOf("--limit"), 10)
      : INDEXING_DEFAULT_LIMIT,
    urls,
  };
}

async function main() {
  const args = parseArgs();
  const config = resolveConfig(args);

  if (!args.doSitemap && !args.doIndexing) {
    console.error(
      "Nothing to do. Pass --sitemap and/or --indexing. See --help at top of script."
    );
    process.exit(1);
  }

  console.log(`GSC property: ${config.site}`);
  console.log(`Sitemap URL:  ${config.sitemapUrl}`);

  let token;
  if (args.dryRun) {
    console.log("[dry-run] Skipping credential load and token exchange.");
  } else {
    const sa = loadServiceAccount();
    console.log(`Service account: ${sa.client_email}`);
    token = await getAccessToken(sa);
    console.log("Access token obtained.");
  }

  if (args.doSitemap) {
    console.log(`\nSubmitting sitemap...`);
    if (args.dryRun) {
      console.log("[dry-run] skipped");
    } else {
      try {
        await submitSitemap(token, config.site, config.sitemapUrl);
        console.log("  OK (sitemap accepted)");
      } catch (err) {
        console.error(`  ${err.message}`);
        process.exitCode = 1;
      }
    }
  }

  if (args.doIndexing) {
    let urls = args.urls ?? [];
    if (urls.length === 0) {
      const sitemapPath = resolve(process.cwd(), config.sitemapPath);
      if (!existsSync(sitemapPath)) {
        console.error(
          `Missing sitemap at ${sitemapPath}. Set sitemapPath in gsc.config.json or run the build first.`
        );
        process.exit(1);
      }
      let entries = parseSitemap(sitemapPath);
      if (args.recent) {
        entries = filterRecent(entries, args.recent);
        console.log(
          `\nFiltered to ${entries.length} URLs modified in last ${args.recent} day(s)`
        );
      }
      // Prioritise freshest URLs so the daily quota lands on new content.
      // Entries without lastmod sort last (treated as epoch 0).
      entries.sort((a, b) => {
        const ta = a.lastmod ? Date.parse(a.lastmod) : 0;
        const tb = b.lastmod ? Date.parse(b.lastmod) : 0;
        return tb - ta;
      });
      urls = entries.map((e) => e.loc);
    }

    if (urls.length === 0) {
      console.log("\nNo URLs to ping via Indexing API.");
      return;
    }

    const toSend = urls.slice(0, args.limit);
    if (urls.length > toSend.length) {
      console.log(
        `\nIndexing API quota protection: capping at ${args.limit} of ${urls.length} URLs.`
      );
    }

    console.log(`\nIndexing API: pinging ${toSend.length} URL(s)...`);
    if (args.dryRun) {
      toSend.forEach((u) => console.log(`  [dry-run] ${u}`));
      return;
    }

    let ok = 0;
    let quotaExceeded = false;
    for (const url of toSend) {
      const result = await pingIndexingAPI(token, url);
      if (result.ok) {
        ok++;
      } else {
        const errMsg = result.data?.error?.message ?? "";
        if (result.status === 429 || /quota/i.test(errMsg)) {
          console.error(`  quota exceeded after ${ok} URL(s): ${errMsg}`);
          quotaExceeded = true;
          break;
        }
        console.error(`  ${result.status} ${errMsg} — ${url}`);
      }
      await new Promise((r) => setTimeout(r, INDEXING_PAUSE_MS));
    }
    console.log(
      `Indexing API done: ${ok}/${toSend.length} succeeded${
        quotaExceeded ? " (stopped early due to quota)" : ""
      }`
    );
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
