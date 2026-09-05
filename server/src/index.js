import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import dotenv from "dotenv";
import { z } from "zod";
import * as cheerio from "cheerio";
import { fetchAvitoProductViaZenRows } from "./adapters/avito.js";
import { upgradeWbImageUrl } from "./lib/imageQuality.js";
import { createRandomLandingDesign, generateLandingWithNexus, getLlmRuntimeInfo, landingContentSchema } from "./handlers/llmhandler.js";
import { renderLandingHtml } from "./handlers/landingrenderer.js";
import { publishLandingToUcoz, publishLandingWithUserUapi } from "./handlers/ucozpublisher.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });
const clientDist = path.join(__dirname, "../../client/dist");

const app = Fastify({ logger: true, trustProxy: true });
const productCache = new Map();
const productCacheTtlMs = 15 * 60 * 1000;
const supportedMarketplaceSchema = z.enum(["wb", "avito"]);

await app.register(cors, { origin: true });
await app.register(fastifyStatic, {
  root: clientDist,
  prefix: "/"
});

const productInputSchema = z.object({
  productUrl: z.string().trim().url().max(2000),
  marketplace: supportedMarketplaceSchema.default("wb")
});

const productDtoSchema = z.object({
  platform: z.string().min(1),
  productId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional().default(""),
  images: z.array(z.string().url()).max(12).default([]),
  characteristics: z.array(z.object({ label: z.string(), value: z.string() })).max(12).default([]),
  price: z.string().nullable().optional(),
  priceWithoutWallet: z.string().nullable().optional(),
  productUrl: z.string().url(),
  fetchedAt: z.string().optional(),
  sourceMode: z.string().optional(),
  sourceStatus: z.string().optional(),
  warnings: z.array(z.string()).optional().default([])
}).passthrough();

const generateInputSchema = z.object({
  product: productDtoSchema.optional(),
  productUrl: z.string().trim().url().max(2000).optional(),
  marketplace: supportedMarketplaceSchema.default("wb")
}).refine((value) => value.product || value.productUrl, { message: "Нужен product или productUrl." });

const publishInputSchema = z.object({
  content: landingContentSchema,
  product: productDtoSchema
});

const userUapiPublishInputSchema = publishInputSchema.extend({
  siteUrl: z.string().trim().url().max(500),
  apiKey: z.string().trim().min(24).max(256).regex(/^sk_live_[A-Za-z0-9_-]+$/, "Некорректный формат uAPI key.")
});

function isSecureCredentialRequest(request) {
  if (process.env.NODE_ENV !== "production") return true;
  return request.protocol === "https";
}

function detectMarketplace(productUrl, requestedMarketplace) {
  if (requestedMarketplace) return requestedMarketplace;
  const host = new URL(productUrl).hostname.toLowerCase();
  if (host.includes("avito")) return "avito";
  if (host.includes("ozon")) return "ozon";
  return "wb";
}

function assertSupportedProductUrl(productUrl, marketplace) {
  const url = new URL(productUrl);
  const hostname = url.hostname.toLowerCase();

  if (marketplace === "wb" && hostname !== "wildberries.ru" && !hostname.endsWith(".wildberries.ru")) {
    throw new Error("Для режима WB нужна ссылка с домена wildberries.ru.");
  }

  if (marketplace === "avito" && hostname !== "avito.ru" && !hostname.endsWith(".avito.ru")) {
    throw new Error("Для режима Avito нужна ссылка с домена avito.ru.");
  }

  if (marketplace === "ozon" && hostname !== "ozon.ru" && !hostname.endsWith(".ozon.ru")) {
    throw new Error("Для режима Ozon нужна ссылка с домена ozon.ru.");
  }
}

function extractProductId(productUrl) {
  const match = productUrl.match(/\/catalog\/(\d+)/i)
    || productUrl.match(/\/product\/[^/?]+-(\d+)/i)
    || productUrl.match(/_(\d+)(?:[/?#]|$)/);
  return match?.[1] || null;
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function firstNonEmpty(...values) {
  return values.map(cleanText).find(Boolean) || "";
}

function parseJsonLd($) {
  const entries = [];
  $("script[type='application/ld+json']").each((_, element) => {
    try {
      const parsed = JSON.parse($(element).text());
      const candidates = Array.isArray(parsed) ? parsed : [parsed, ...(parsed?.['@graph'] || [])];
      entries.push(...candidates.filter(Boolean));
    } catch {
      // Some marketplace pages contain partial JSON-LD. Other metadata is enough for MVP.
    }
  });
  return entries.find((entry) => entry["@type"] === "Product" || entry.name || entry.offers) || {};
}

function parseCharacteristics($, product) {
  const characteristics = [];
  const properties = product.additionalProperty || product.properties || [];

  if (Array.isArray(properties)) {
    for (const property of properties) {
      const label = cleanText(property.name || property.label);
      const value = cleanText(property.value || property.valueReference);
      if (label && value) characteristics.push({ label, value });
    }
  }

  if (!characteristics.length) {
    $("meta[property^='product:']").each((_, element) => {
      const label = cleanText($(element).attr("property")).replace(/^product:/, "");
      const value = cleanText($(element).attr("content"));
      if (label && value) characteristics.push({ label, value });
    });
  }

  return characteristics.slice(0, 12);
}

function parseWbHtml(html, productUrl, fetchedAt, sourceMode = "zenrows") {
  const $ = cheerio.load(html);
  const jsonLd = parseJsonLd($);
  const offers = Array.isArray(jsonLd.offers) ? jsonLd.offers[0] : jsonLd.offers || {};
  const images = [
    ...(Array.isArray(jsonLd.image) ? jsonLd.image : [jsonLd.image]),
    $("meta[property='og:image']").attr("content")
  ].map(cleanText).filter(Boolean);
  const title = firstNonEmpty(
    jsonLd.name,
    $("meta[property='og:title']").attr("content"),
    $("meta[name='twitter:title']").attr("content"),
    $("title").first().text()
  );
  const descriptionMeta = firstNonEmpty(
    $("meta[name='description']").attr("content"),
    $("meta[property='og:description']").attr("content")
  );
  const summaryMatch = descriptionMeta.match(/^(.+?)\s+\d{7,9}\s+купить\s+за\s+([\d\s.,]+)\s*₽/i)
    || title.match(/^(.+?)\s+\d{7,9}\s+купить\s+за\s+([\d\s.,]+)\s*₽/i);
  const productTitle = firstNonEmpty(jsonLd.name, summaryMatch?.[1], title);
  const description = firstNonEmpty(
    jsonLd.description,
    $("meta[property='og:description']").attr("content"),
    $("meta[name='description']").attr("content")
  );
  const price = firstNonEmpty(
    offers.price,
    jsonLd.price,
    $("meta[property='product:price:amount']").attr("content"),
    summaryMatch?.[2]
  );
  const productId = extractProductId(productUrl) || cleanText(jsonLd.sku || jsonLd.productID);
  const productImagePattern = /(?:https?:)?\/\/[^\s"'<>\\]+\/\d{7,9}\/images\/[^\s"'<>\\]+\.(?:jpg|jpeg|png|webp|avif)(?:\?[^\s"'<>\\]*)?/gi;
  const productImages = [...html.matchAll(productImagePattern)]
    .map((match) => match[0].startsWith("//") ? `https:${match[0]}` : match[0])
    .filter((url) => productId && url.includes(`/${productId}/images/`));
  const extractedImages = [...new Set([...images, ...productImages].map(normalizeWbImageUrl))].slice(0, 12);
  const warnings = [];

  if (!productTitle) warnings.push("Название не найдено в публичной разметке карточки.");
  if (!description) warnings.push("Описание не найдено в публичной разметке карточки.");
  if (!extractedImages.length) warnings.push("Изображения не найдены в публичной разметке карточки.");

  return {
    platform: "WB",
    productId: productId || "unknown",
    title: productTitle || "Товар с Wildberries",
    description,
    images: extractedImages,
    characteristics: parseCharacteristics($, jsonLd),
    price: price ? `${price} ₽` : null,
    priceWithoutWallet: price ? `${price} ₽` : null,
    productUrl,
    fetchedAt,
    sourceMode,
    sourceStatus: title || images.length ? "fetched" : "partial",
    warnings
  };
}

async function readResponseWithLimit(response, maxBytes = 2_000_000) {
  if (!response.body) return { text: await response.text(), partial: false };
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  let partial = false;
  const expectedLength = Number(response.headers.get("content-length"));

  const readChunkWithTimeout = () => new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error("ZenRows не начал передачу тела ответа вовремя.");
      error.code = "BODY_IDLE";
      reject(error);
    }, 30_000);

    reader.read().then((result) => {
      clearTimeout(timer);
      resolve(result);
    }, (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

  while (true) {
    let result;
    try {
      result = await readChunkWithTimeout();
    } catch (error) {
      if (error.code !== "BODY_IDLE" || !chunks.length) throw error;
      partial = true;
      reader.cancel().catch(() => {});
      break;
    }

    const { done, value } = result;
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Страница товара слишком большая для обработки.");
    }
    chunks.push(value);
    if (expectedLength > 0 && total >= expectedLength) break;
  }

  return {
    text: new TextDecoder().decode(Buffer.concat(chunks)),
    partial
  };
}

function flattenExtractedValue(value) {
  if (Array.isArray(value)) return value.flatMap(flattenExtractedValue);
  const cleaned = cleanText(value);
  return cleaned ? [cleaned] : [];
}

function normalizeExtractedDescription(...values) {
  return [...new Set(values.flatMap(flattenExtractedValue))]
    .map((text) => splitDescriptionIntoBlocks(text))
    .filter(Boolean)
    .join("\n\n");
}

function splitDescriptionIntoBlocks(text) {
  const normalized = cleanText(text);
  if (normalized.length < 420) return normalized;
  const sentences = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length < 2) return normalized;
  const targetLength = Math.ceil(normalized.length / 3);
  const blocks = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && current.length >= targetLength && blocks.length < 2) {
      blocks.push(current);
      current = "";
    }
    current = current ? `${current} ${sentence}` : sentence;
  }
  if (current) blocks.push(current);
  return blocks.join("\n\n");
}

function normalizeExtractedCharacteristics(value) {
  const entries = Array.isArray(value) ? value : [value];
  return entries.flatMap((entry, index) => {
    if (entry && typeof entry === "object") {
      const label = cleanText(entry.label || entry.name || entry.key);
      const itemValue = cleanText(entry.value || entry.text || entry.content);
      return label && itemValue ? [{ label, value: itemValue }] : [];
    }
    const text = cleanText(entry);
    if (!text) return [];
    const separator = text.match(/^(.+?)\s*[:—-]\s*(.+)$/);
    return [{
      label: cleanText(separator?.[1] || `Характеристика ${index + 1}`),
      value: cleanText(separator?.[2] || text)
    }];
  }).slice(0, 12);
}

function normalizeWbImageUrl(imageUrl) {
  return upgradeWbImageUrl(imageUrl);
}

function formatWbPrice(amount, fraction) {
  const normalizedAmount = cleanText(String(amount || "").replace(/\s+/g, " "));
  if (!normalizedAmount) return "";
  return `${normalizedAmount}${fraction ? `,${fraction}` : ""} ₽`;
}

function normalizeWbPrice(value, { allowBareNumber = false } = {}) {
  const text = cleanText(value).replace(/\u00a0|&nbsp;/gi, " ");
  if (!text) return "";
  const buyMatch = text.match(/купить\s+за\s+([\d\s]+(?:[.,]\d{1,2})?)\s*₽/i);
  if (buyMatch) {
    const [amount, fraction] = buyMatch[1].split(/[.,]/);
    return formatWbPrice(amount, fraction);
  }
  const withCurrency = text.match(/(?<![\d.])(\d{1,3}(?:\s\d{3})+|\d{2,7})(?:[.,](\d{1,2}))?\s*₽/);
  if (withCurrency) return formatWbPrice(withCurrency[1], withCurrency[2]);
  if (allowBareNumber && /^\d[\d\s]{0,12}(?:[.,]\d{1,2})?$/.test(text)) {
    const [amount, fraction] = text.split(/[.,]/);
    return formatWbPrice(amount, fraction);
  }
  return "";
}

function isGenericWbTitle(title) {
  const text = cleanText(title);
  return !text || /^товар с /i.test(text) || /интернет.?магазин wildberries/i.test(text);
}

function parseWbExtractedJson(payload, productUrl, fetchedAt) {
  const extracted = payload?.data && typeof payload.data === "object" && !Array.isArray(payload.data)
    ? payload.data
    : payload;
  const productId = extractProductId(productUrl) || "unknown";
  const imageCandidates = [
    ...flattenExtractedValue(extracted?.image),
    ...flattenExtractedValue(extracted?.image_product),
    ...flattenExtractedValue(extracted?.image_data)
  ].map(normalizeWbImageUrl);
  const productImages = imageCandidates.filter((imageUrl) =>
    imageUrl.includes("/images/") && (!productId || productId === "unknown" || imageUrl.includes(`/${productId}/images/`))
  );
  const images = [...new Set(productImages.length ? productImages : imageCandidates.filter((imageUrl) => imageUrl.includes("/images/")))];
  const extractedTitle = [extracted?.title].flatMap(flattenExtractedValue).find((value) => !isGenericWbTitle(value)) || "";
  const ogTitle = firstNonEmpty(extracted?.og_title);
  const summaryMatch = cleanText(ogTitle).match(/^(.+?)\s+\d{7,9}\s+купить\s+за\s+/i);
  const title = extractedTitle || cleanText(summaryMatch?.[1]);
  const priceWithoutWallet = [
    normalizeWbPrice(extracted?.price_without_wallet),
    normalizeWbPrice(extracted?.price),
    normalizeWbPrice(extracted?.price_wallet),
    normalizeWbPrice(extracted?.price_meta, { allowBareNumber: true }),
    normalizeWbPrice(extracted?.item_price, { allowBareNumber: true }),
    normalizeWbPrice(extracted?.og_title),
    normalizeWbPrice(extracted?.meta_description)
  ].find(Boolean) || "";
  const description = normalizeExtractedDescription(
    extracted?.description,
    extracted?.description_paragraphs,
    extracted?.description_lists
  ) || normalizeExtractedDescription(
    extracted?.description_block,
    extracted?.description_text
  );
  const characteristics = normalizeExtractedCharacteristics(extracted?.characteristics);
  const warnings = [];

  if (!title) warnings.push("Название не найдено в CSS Extractor-ответе.");
  if (!priceWithoutWallet) warnings.push("Цена без WB Кошелька не найдена в CSS Extractor-ответе.");
  if (!description) warnings.push("Описание не найдено после открытия блока характеристик.");
  if (!images.length) warnings.push("Изображение не найдено в CSS Extractor-ответе.");

  return {
    platform: "WB",
    productId,
    title: title || "Товар с Wildberries",
    description,
    images: [...new Set(images)].slice(0, 12),
    characteristics,
    price: priceWithoutWallet || null,
    priceWithoutWallet: priceWithoutWallet || null,
    productUrl,
    fetchedAt,
    sourceMode: "zenrows",
    sourceStatus: title && !isGenericWbTitle(title) && images.length && productId !== "unknown" ? "fetched" : "partial",
    warnings
  };
}

async function fetchWbProductViaZenRows(productUrl) {
  const params = new URLSearchParams({
    apikey: process.env.ZENROWS_API_KEY,
    url: productUrl,
    js_render: "true",
    wait: "15000",
    original_status: "true",
    js_instructions: JSON.stringify([
      { wait: 5000 },
      { evaluate: "document.querySelector('button.btnDetail--W_bph')?.click();" },
      { wait: 3000 }
    ]),
    css_extractor: JSON.stringify({
      title: "h2.productTitle--jKvWV, h1[class*='productTitle']",
      price: "[class*='priceBlockPrice'], ins.price-block__final-price",
      price_without_wallet: "[class*='priceBlockPrice'], ins.price-block__final-price",
      price_wallet: "[class*='walletPrice']",
      price_meta: "meta[property='product:price:amount']@content",
      item_price: "[itemprop='price']@content",
      og_title: "meta[property='og:title']@content",
      meta_description: "meta[name='description']@content",
      description: ".mo-drawer__paper .content--IOf3X p",
      description_paragraphs: ".mo-drawer__paper .content--IOf3X p",
      description_block: ".mo-drawer__paper .content--IOf3X",
      description_text: ".mo-drawer__paper .content--IOf3X [class*='text']",
      description_lists: ".content--IOf3X li",
      characteristics: "div.popup-product-details div.product-params table.product-params__table tr",
      image: "meta[property='og:image']@content",
      image_product: "img[src*='wbbasket.ru'][src*='/images/']@src",
      image_data: "img[data-src*='wbbasket.ru'][data-src*='/images/']@data-src"
    })
  });
  if (process.env.ZENROWS_CAPTURE_XHR === "true") {
    params.set("json_response", "true");
  }
  const response = await fetch(`https://api.zenrows.com/v1/?${params}`, {
    signal: AbortSignal.timeout(90_000)
  });
  const bodyResult = await readResponseWithLimit(response, 5_000_000);
  const body = bodyResult.text;

  if (!response.ok) {
    const detail = cleanText(body).slice(0, 240);
    throw new Error(`ZenRows вернул HTTP ${response.status}${detail ? `: ${detail}` : "."}`);
  }

  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json") || body.trim().startsWith("{")) {
    try {
      const payload = JSON.parse(body);
      if (payload.html || payload.data?.html) {
        const html = payload.html || payload.data.html;
        if (html.includes("/__wbaas/challenges/antibot/")) {
          throw new Error("ZenRows вернул anti-bot challenge WB вместо страницы товара.");
        }
        return parseWbHtml(html, productUrl, new Date().toISOString(), "zenrows");
      }
      return parseWbExtractedJson(payload, productUrl, new Date().toISOString());
    } catch {
      throw new Error("ZenRows вернул некорректный JSON-ответ.");
    }
  }

  const html = body;
  if (!html) throw new Error("ZenRows не вернул HTML страницы.");
  if (html.includes("/__wbaas/challenges/antibot/")) {
    throw new Error("ZenRows вернул anti-bot challenge WB вместо страницы товара.");
  }

  const product = parseWbHtml(html, productUrl, new Date().toISOString(), "zenrows");
  if (bodyResult.partial) {
    product.warnings.unshift("ZenRows не закрыл HTML-поток; обработана полученная часть ответа.");
  }
  return product;
}

function isFallbackProductTitle(title) {
  return !title || /^Товар с /i.test(title);
}

function createMockProduct(productUrl, requestedMarketplace) {
  const marketplace = detectMarketplace(productUrl, requestedMarketplace);
  return {
    platform: marketplace === "avito" ? "Avito" : marketplace === "ozon" ? "Ozon" : "WB",
    productId: "demo-123456",
    title: "Демо-товар для лендинга",
    description: "Тестовое описание товара для проверки AI pipeline.",
    images: [
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1200&q=85",
      "https://images.unsplash.com/photo-1503602642458-232111445657?auto=format&fit=crop&w=900&q=85"
    ],
    characteristics: [
      { label: "Категория", value: "Демо-категория" },
      { label: "Состояние", value: "Новое" }
    ],
    price: "2 990 ₽",
    priceWithoutWallet: "2 990 ₽",
    productUrl,
    fetchedAt: new Date().toISOString(),
    sourceMode: "zenrows",
    sourceStatus: "mock",
    warnings: ["Резервный демо-режим: реальная карточка ZenRows не получена."]
  };
}

function productQualityScore(product) {
  if (!product) return 0;
  return [
    product.title && !isFallbackProductTitle(product.title) ? 3 : 0,
    product.price ? 2 : 0,
    product.description ? 3 : 0,
    Array.isArray(product.images) && product.images.length ? 2 : 0,
    Array.isArray(product.characteristics) && product.characteristics.length ? 1 : 0
  ].reduce((sum, value) => sum + value, 0);
}

function isCacheableProduct(product) {
  return product?.sourceStatus === "fetched"
    && product.title
    && !isFallbackProductTitle(product.title)
    && (product.platform === "Avito" || Boolean(product.price))
    && (product.platform === "Avito" || Boolean(product.description))
    && Array.isArray(product.images)
    && product.images.length > 0;
}

async function parseProduct(productUrl, requestedMarketplace) {
  const marketplace = detectMarketplace(productUrl, requestedMarketplace);
  assertSupportedProductUrl(productUrl, marketplace);

  const cacheKey = `${marketplace}:${extractProductId(productUrl) || productUrl}`;
  const cached = productCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < productCacheTtlMs && isCacheableProduct(cached.product)) {
    return {
      ...cached.product,
      warnings: [...new Set([...(cached.product.warnings || []), "Использована подтверждённая карточка из локального кэша."])]
    };
  }
  if (cached) productCache.delete(cacheKey);

  const fetchers = {
    wb: fetchWbProductViaZenRows,
    avito: fetchAvitoProductViaZenRows
  };
  const fetchProduct = fetchers[marketplace];

  if (fetchProduct) {
    try {
      if (!process.env.ZENROWS_API_KEY) throw new Error("ZENROWS_API_KEY не настроен на backend.");
      let product = await fetchProduct(productUrl);
      const productNeedsRetry = !product.title
        || isFallbackProductTitle(product.title)
        || (!product.price && marketplace === "wb")
        || (!product.description && marketplace === "wb")
        || !product.images.length;
      if (productNeedsRetry && process.env.ZENROWS_EMPTY_RETRY !== "false") {
        const retriedProduct = await fetchProduct(productUrl);
        if (productQualityScore(retriedProduct) >= productQualityScore(product)) product = retriedProduct;
      }
      if (isCacheableProduct(product)) productCache.set(cacheKey, { product, savedAt: Date.now() });
      return product;
    } catch (error) {
      if (process.env.DEMO_FALLBACK === "true") {
        const fallback = createMockProduct(productUrl, marketplace);
        fallback.sourceStatus = "fallback";
        fallback.warnings = [`ZenRows не получил карточку: ${error.message}`, ...fallback.warnings];
        return fallback;
      }
      throw error;
    }
  }

  return createMockProduct(productUrl, marketplace);
}

function buildMockLanding(product) {
  const platformName = product.platform;
  const productBenefits = product.characteristics
    .slice(0, 3)
    .map(({ label, value }) => `${label}: ${value}`);
  return {
    design: createRandomLandingDesign(),
    seo: {
      title: `${product.title} — заказать на ${platformName}`,
      description: `Узнайте больше о товаре «${product.title}» и перейдите к покупке на ${platformName}.`,
      slug: `product-${product.productId}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "product",
      keywords: [product.title, product.platform, "купить товар"].slice(0, 8)
    },
    hero: {
      eyebrow: `${platformName} · выбор покупателя`,
      headline: product.title,
      subheadline: product.description || "Короткий продающий лендинг, собранный из данных карточки маркетплейса.",
      image: product.images[0] || null
    },
    benefits: productBenefits.length ? productBenefits : [
      "Понятная презентация товара",
      "Фокус на ключевых характеристиках",
      "Прямой переход к покупке"
    ],
    specifications: product.characteristics,
    faq: [
      {
        question: "Где оформить заказ?",
        answer: `Заказ оформляется на ${platformName} по исходной ссылке.`
      }
    ],
    cta: {
      text: `Купить на ${platformName}`,
      url: product.productUrl,
      supportingText: `Вы перейдёте на ${platformName}, где можно проверить актуальные условия и оформить заказ.`
    },
    warnings: product.warnings || []
  };
}

app.get("/api/health", async () => ({
  ok: true,
  service: "ucoz-market-page-ai",
  mode: "zenrows-only",
  llm: getLlmRuntimeInfo(),
  ucoz: {
    configured: Boolean(process.env.UCOZ_API_TOKEN && process.env.UCOZ_SITE_URL),
    mode: process.env.UCOZ_PUBLISH_MODE || "mcp"
  },
  timestamp: new Date().toISOString()
}));

app.post("/api/parse", async (request, reply) => {
  const parsed = productInputSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "Введите корректную ссылку на товар." });
  }
  try {
    return { product: await parseProduct(parsed.data.productUrl, parsed.data.marketplace) };
  } catch (error) {
    return reply.code(502).send({ error: error.message || "Не удалось получить карточку товара." });
  }
});

app.post("/api/generate", async (request, reply) => {
  const parsed = generateInputSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "Передайте проверенную карточку товара." });
  }
  let product;
  try {
    product = parsed.data.product || await parseProduct(parsed.data.productUrl, parsed.data.marketplace);
  } catch (error) {
    return reply.code(502).send({ error: error.message || "Не удалось получить карточку товара." });
  }
  try {
    const generated = await generateLandingWithNexus(product);
    return {
      product,
      content: generated.content,
      html: renderLandingHtml(product, generated.content),
      mode: generated.mode,
      provider: generated.provider,
      model: generated.model,
      requestId: generated.requestId,
      warnings: [...new Set([...(product.warnings || []), ...(generated.warnings || [])])]
    };
  } catch (error) {
    if (process.env.AI_DEMO_FALLBACK !== "false" && process.env.DEMO_FALLBACK !== "false") {
      const content = buildMockLanding(product);
      return {
        product,
        content,
        html: renderLandingHtml(product, content),
        mode: "mock",
        warnings: [...new Set([...(product.warnings || []), `AI недоступен: ${error.message}`, "Резервный mock-контент использован для демо."])]
      };
    }
    return reply.code(502).send({ error: error.message || "Не удалось сгенерировать лендинг." });
  }
});

app.post("/api/publish", async (request, reply) => {
  const parsed = publishInputSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "Некорректные данные для публикации." });
  }
  const html = renderLandingHtml(parsed.data.product, parsed.data.content);
  try {
    const publication = await publishLandingToUcoz({
      product: parsed.data.product,
      content: parsed.data.content,
      html
    });
    return {
      ...publication,
      message: publication.verificationStatus === "pending"
        ? "Лендинг записан по FTP. uCoz ещё обновляет публичный URL — страница может открыться в течение 1–2 минут."
        : "Лендинг опубликован на uCoz и доступен по публичному URL.",
      previewUrl: publication.url
    };
  } catch (error) {
    request.log.error({ err: error }, "uCoz publication failed");
    return reply.code(502).send({ error: error.message || "Не удалось опубликовать лендинг на uCoz." });
  }
});

app.post("/api/publish/uapi", async (request, reply) => {
  reply.header("Cache-Control", "no-store");
  if (!isSecureCredentialRequest(request)) {
    return reply.code(400).send({ error: "Передача uAPI key разрешена только через HTTPS." });
  }
  const parsed = userUapiPublishInputSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: parsed.error.issues[0]?.message || "Некорректные данные uAPI-публикации." });
  }
  const { product, content, siteUrl, apiKey } = parsed.data;
  const html = renderLandingHtml(product, content);
  try {
    const publication = await publishLandingWithUserUapi({ product, content, html, siteUrl, apiKey });
    return {
      ...publication,
      message: publication.customUrlDisabled
        ? "Страница создана через uAPI с системным URL: индивидуальные URL отключены в настройках сайта."
        : "Новая редактируемая страница создана через uAPI.",
      previewUrl: publication.url
    };
  } catch (error) {
    request.log.error({ message: error.message }, "user uAPI publication failed");
    return reply.code(502).send({ error: error.message || "Не удалось создать страницу через uAPI." });
  }
});

app.setNotFoundHandler((request, reply) => {
  if (request.method === "GET" && !request.url.startsWith("/api/")) {
    return reply.sendFile("index.html");
  }
  return reply.code(404).send({ error: "Not found" });
});

const port = Number(process.env.PORT || 3001);
await app.listen({ port, host: "0.0.0.0" });
