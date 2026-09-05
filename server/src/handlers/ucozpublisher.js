import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ucozServerEntry = path.join(__dirname, "../../node_modules/ucoz-mcp/dist/index.js");

function requireUcozConfig(required) {
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Не настроены переменные uCoz: ${missing.join(", ")}.`);
}

function ensurePoweredBy(html) {
  if (html.includes("$POWERED_BY$")) return html;
  const poweredBy = '<footer style="padding:18px;text-align:center;font:12px Arial,sans-serif;opacity:.7">$POWERED_BY$</footer>';
  if (html.includes("</body>")) return html.replace("</body>", `${poweredBy}</body>`);
  return `${html}\n${poweredBy}`;
}

function readToolText(result) {
  return (result?.content || [])
    .filter((item) => item?.type === "text")
    .map((item) => item.text)
    .join("\n")
    .trim();
}

function parseToolPayload(result) {
  if (result?.structuredContent) return result.structuredContent;
  const text = readToolText(result);
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

function normalizeSiteUrl() {
  return process.env.UCOZ_SITE_URL.replace(/\/$/, "");
}

function normalizeExternalSiteUrl(value) {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  const privateHostname = hostname === "localhost"
    || hostname === "::1"
    || hostname.endsWith(".local")
    || /^127\./.test(hostname)
    || /^10\./.test(hostname)
    || /^192\.168\./.test(hostname)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
  if (url.protocol !== "https:" || privateHostname || url.username || url.password) {
    throw new Error("Укажите публичный HTTPS-адрес сайта uCoz.");
  }
  return url.origin;
}

function pickPayloadValue(payload, keys) {
  const candidates = [payload, payload?.data, payload?.result, payload?.page, payload?.success].filter(Boolean);
  for (const candidate of candidates) {
    for (const key of keys) {
      if (candidate?.[key] !== undefined && candidate?.[key] !== null) return candidate[key];
    }
  }
  return null;
}

function sanitizeUapiText(value) {
  return String(value || "")
    .replace(/sk_live_[A-Za-z0-9_-]+/g, "[uAPI key hidden]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 320);
}

export function formatUapiFailure(payload, rawBody = "") {
  const error = payload?.error ?? payload?.ERROR ?? payload?.errors ?? null;
  if (typeof error === "string") return sanitizeUapiText(error);
  if (Array.isArray(error)) {
    return sanitizeUapiText(error.map((item) => typeof item === "string" ? item : item?.msg || item?.message || JSON.stringify(item)).join("; "));
  }
  if (error && typeof error === "object") {
    const message = error.msg || error.message || error.description || "uAPI отклонил запрос";
    const details = [error.code && `code: ${error.code}`, error.num !== undefined && `num: ${error.num}`].filter(Boolean);
    let hint = "";
    if (error.code === "ACCESS_DENIED") hint = " Проверьте, что ключ выпущен для этого сайта и имеет права на модуль «Страницы».";
    if (error.code === "VALIDATION_ERROR" && Number(error.num) === 2) hint = " Личный шаблон должен содержать $POWERED_BY$.";
    return sanitizeUapiText(`${message}${details.length ? ` (${details.join(", ")})` : ""}.${hint}`);
  }
  if (payload?.message || payload?.msg) return sanitizeUapiText(payload.message || payload.msg);
  if (rawBody) return sanitizeUapiText(rawBody);
  return "uAPI вернул ошибку без описания.";
}

function createUapiRequestError(message, payload, status) {
  const error = new Error(message);
  const details = payload?.error ?? payload?.ERROR;
  error.uapiCode = details && typeof details === "object" ? details.code || null : null;
  error.uapiNumber = details && typeof details === "object" ? details.num ?? null : null;
  error.httpStatus = status;
  return error;
}

async function requestUapiPages({ siteUrl, apiKey, method = "GET", body, query = "" }) {
  const response = await fetch(`${siteUrl}/uapi/pages${query}`, {
    method,
    redirect: "error",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" } : {})
    },
    body,
    signal: AbortSignal.timeout(30_000)
  });
  const rawBody = await response.text();
  let payload = null;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    // Keep a short, sanitized error without exposing request credentials.
  }
  if (!response.ok) {
    throw createUapiRequestError(`uAPI вернул HTTP ${response.status}: ${formatUapiFailure(payload, rawBody)}`, payload, response.status);
  }
  if (!payload || payload?.error || payload?.ERROR) {
    throw createUapiRequestError(`uAPI отклонил запрос: ${formatUapiFailure(payload, rawBody)}`, payload, response.status);
  }
  return payload;
}

const publicationVerificationDelays = [0, 1_000, 2_000, 3_500, 5_000, 8_000, 10_000];

function wait(delay) {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

async function waitForPublishedUrl(publishedUrl) {
  let lastStatus = null;
  let lastError = null;

  for (let attempt = 0; attempt < publicationVerificationDelays.length; attempt += 1) {
    const delay = publicationVerificationDelays[attempt];
    if (delay) await wait(delay);

    try {
      const verificationUrl = new URL(publishedUrl);
      verificationUrl.searchParams.set("_ucoz_verify", `${Date.now()}-${attempt}`);
      const response = await fetch(verificationUrl, {
        cache: "no-store",
        headers: { Accept: "text/html" },
        signal: AbortSignal.timeout(8_000)
      });
      lastStatus = response.status;
      await response.body?.cancel().catch(() => {});
      if (response.ok) {
        return {
          status: "ready",
          httpStatus: response.status,
          attempts: attempt + 1
        };
      }
      lastError = null;
    } catch (error) {
      lastError = error;
    }
  }

  return {
    status: "pending",
    httpStatus: lastStatus,
    attempts: publicationVerificationDelays.length,
    error: lastError?.message || null
  };
}

function assertToolSuccess(result, fallbackMessage) {
  const text = readToolText(result);
  if (result?.isError || /^\s*❌/u.test(text) || /ошибка/i.test(text) || /prohibited file name/i.test(text) || /"error"\s*:/i.test(text)) {
    throw new Error(text || fallbackMessage);
  }
  return result;
}

function buildFtpFileName(product, operationId) {
  const productId = String(product.productId || "item").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 24) || "item";
  return `ai-${productId}-${operationId.slice(0, 8)}.html`;
}

async function callUcozTool(name, args) {
  const client = new Client({ name: "ucoz-market-page-ai", version: "0.2.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [ucozServerEntry],
    env: { ...process.env }
  });

  try {
    await client.connect(transport);
    const result = await client.callTool({ name, arguments: args });
    if (result?.isError) throw new Error(readToolText(result) || `uCoz MCP tool ${name} завершился с ошибкой.`);
    return result;
  } finally {
    await client.close().catch(() => {});
  }
}

export async function checkUcozConnection() {
  requireUcozConfig(["UCOZ_API_TOKEN", "UCOZ_SITE_URL"]);
  const result = await callUcozTool("templates_tool", {
    action: "page_list",
    page_page: 1,
    page_per_page: 5
  });
  return parseToolPayload(result);
}

export async function checkUcozFtpConnection() {
  const required = ["UCOZ_FTP_HOST", "UCOZ_FTP_USER", "UCOZ_FTP_PASS"];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Не настроены переменные FTP uCoz: ${missing.join(", ")}.`);
  const result = await callUcozTool("ftp_tool", { action: "list", path: "/" });
  return parseToolPayload(result);
}

export async function publishLandingToUcoz({ product, content, html }) {
  const publishMode = process.env.UCOZ_PUBLISH_MODE || "ftp";
  requireUcozConfig(publishMode === "pages"
    ? ["UCOZ_API_TOKEN", "UCOZ_SITE_URL"]
    : ["UCOZ_SITE_URL", "UCOZ_FTP_HOST", "UCOZ_FTP_USER", "UCOZ_FTP_PASS"]);
  const operationId = crypto
    .createHash("sha256")
    .update(`${product.productId}:${Date.now()}:${crypto.randomUUID()}`)
    .digest("hex")
    .slice(0, 20);
  const baseSlug = content.seo.slug.replace(/^-+|-+$/g, "").slice(0, 58) || `product-${product.productId}`;
  const slug = `${baseSlug}-${operationId.slice(0, 8)}`;

  if (publishMode !== "pages") {
    const remotePath = buildFtpFileName(product, operationId);
    const result = assertToolSuccess(await callUcozTool("ftp_tool", {
      action: "write",
      filepath: remotePath,
      content: html
    }), "uCoz FTP не смог записать лендинг.");
    const publishedUrl = `${normalizeSiteUrl()}/${remotePath}`;

    const verification = await waitForPublishedUrl(publishedUrl);

    return {
      published: true,
      operationId,
      pageId: null,
      slug,
      url: publishedUrl,
      remotePath,
      mode: "ftp",
      provider: "ucoz-mcp/ftp",
      verificationStatus: verification.status,
      verificationHttpStatus: verification.httpStatus,
      verificationAttempts: verification.attempts,
      transportResult: readToolText(result)
    };
  }

  const result = assertToolSuccess(await callUcozTool("templates_tool", {
    action: "page_add",
    page_name: content.seo.title,
    page_message: content.seo.title,
    page_tmpl: ensurePoweredBy(html),
    page_owntmpl: 1,
    page_ownurl: slug,
    page_parent_id: 0,
    page_pending: 0,
    page_access_all: 1,
    page_meta_title: content.seo.title,
    page_meta_description: content.seo.description,
    page_meta_keywords: [product.platform, product.title, product.productId].filter(Boolean).join(", ")
  }), "uCoz Pages API не смог создать страницу.");

  const payload = parseToolPayload(result);
  const toolText = readToolText(result);
  const urlMatch = toolText.match(/https?:\/\/[^\s"'<>]+/i);
  const publishedUrl = payload?.url || payload?.data?.url || urlMatch?.[0] || `${normalizeSiteUrl()}/${slug}`;
  const pageId = payload?.id || payload?.page_id || payload?.data?.id || null;

  return {
    published: true,
    operationId,
    pageId,
    slug,
    url: publishedUrl,
    mode: "mcp",
    provider: "ucoz-mcp"
  };
}

export async function publishLandingWithUserUapi({ product, content, html, siteUrl: rawSiteUrl, apiKey }) {
  const siteUrl = normalizeExternalSiteUrl(rawSiteUrl);
  const operationId = crypto
    .createHash("sha256")
    .update(`${product.productId}:${Date.now()}:${crypto.randomUUID()}`)
    .digest("hex")
    .slice(0, 20);
  const baseSlug = content.seo.slug.replace(/^-+|-+$/g, "").slice(0, 58) || `product-${product.productId}`;
  const slug = `${baseSlug}-${operationId.slice(0, 8)}`;
  const form = new URLSearchParams({
    name: content.seo.title,
    message: content.seo.title,
    tmpl: ensurePoweredBy(html),
    owntmpl: "1",
    parent_id: "0",
    pending: "0",
    access_all: "1",
    meta_title: content.seo.title,
    meta_description: content.seo.description,
    meta_keywords: content.seo.keywords.join(", ")
  });
  form.set("ownurl", slug);
  let customUrlDisabled = false;
  let payload;
  try {
    payload = await requestUapiPages({
      siteUrl,
      apiKey,
      method: "POST",
      body: form.toString()
    });
  } catch (error) {
    if (error.uapiCode !== "SEO_OWNURL_DISABLED") throw error;
    customUrlDisabled = true;
    form.delete("ownurl");
    payload = await requestUapiPages({
      siteUrl,
      apiKey,
      method: "POST",
      body: form.toString()
    });
  }
  const pageId = pickPayloadValue(payload, ["id", "page_id"]);
  let publishedUrl = pickPayloadValue(payload, ["url", "page_url"]);

  if (!publishedUrl && pageId) {
    const pagePayload = await requestUapiPages({
      siteUrl,
      apiKey,
      query: `?id=${encodeURIComponent(pageId)}`
    });
    publishedUrl = pickPayloadValue(pagePayload, ["url", "page_url"]);
  }
  if (!publishedUrl) publishedUrl = `${siteUrl}/${slug}`;

  return {
    published: true,
    operationId,
    pageId: pageId || null,
    slug,
    url: safePublishedUrl(publishedUrl, siteUrl),
    mode: "uapi",
    provider: "ucoz-uapi/pages",
    customUrlDisabled
  };
}

function safePublishedUrl(value, siteUrl) {
  try {
    const url = new URL(value, siteUrl);
    if (url.protocol !== "https:") throw new Error("unsafe protocol");
    return url.toString();
  } catch {
    return `${siteUrl}/`;
  }
}
