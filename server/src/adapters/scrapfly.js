import { parseAvitoHtml } from "./avito.js";

const SCRAPFLY_ENDPOINT = "https://api.scrapfly.io/scrape";

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function scrapflyError(response, payload, body) {
  const rejectCode = response.headers.get("x-scrapfly-reject-code");
  const apiError = payload?.result?.error;
  const detail = cleanText(
    apiError?.message
      || apiError?.reason
      || apiError?.code
      || payload?.message
      || body
  ).slice(0, 320);
  return new Error(
    `Scrapfly вернул HTTP ${response.status}`
      + `${rejectCode ? ` (${rejectCode})` : ""}`
      + `${detail ? `: ${detail}` : "."}`
  );
}

async function readClob(contentUrl, apiKey) {
  const url = new URL(contentUrl);
  if (!url.searchParams.has("key")) url.searchParams.set("key", apiKey);
  const response = await fetch(url, { signal: AbortSignal.timeout(45_000) });
  const content = await response.text();
  if (!response.ok) {
    throw new Error(`Scrapfly не отдал CLOB с HTML: HTTP ${response.status}.`);
  }
  return content;
}

export async function fetchAvitoProductViaScrapfly(productUrl) {
  const apiKey = process.env.SCRAPFLY_API_KEY;
  if (!apiKey) throw new Error("SCRAPFLY_API_KEY не настроен на backend.");

  const params = new URLSearchParams({
    key: apiKey,
    url: productUrl,
    asp: "true",
    render_js: "true",
    country: "ru",
    lang: "ru-RU,ru",
    format: "raw",
    retry: "true",
    wait_for_selector: "h1",
    rendering_wait: "1000"
  });

  const response = await fetch(`${SCRAPFLY_ENDPOINT}?${params}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(160_000)
  });
  const body = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(body);
  } catch {
    // Scrapfly normally returns JSON, but keep the error readable if its gateway does not.
  }

  if (!response.ok || payload?.result?.success === false) {
    throw scrapflyError(response, payload, body);
  }

  let html = payload?.result?.content;
  if (!html && body.trim().startsWith("<")) html = body;
  if (payload?.result?.format === "clob" && html) html = await readClob(html, apiKey);
  if (!html || typeof html !== "string") {
    throw new Error("Scrapfly не вернул HTML страницы Avito.");
  }

  const product = parseAvitoHtml(html, productUrl, new Date().toISOString(), "scrapfly");
  if (product.sourceStatus !== "fetched") {
    throw new Error(`Scrapfly получил HTML, но карточка Avito неполная: ${product.warnings.join(" ")}`);
  }
  return product;
}
