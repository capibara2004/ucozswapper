import * as cheerio from "cheerio";
import { pickLargestSrcsetUrl, upgradeAvitoImageUrl } from "../lib/imageQuality.js";

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function firstNonEmpty(...values) {
  return values.map(cleanText).find(Boolean) || "";
}

function firstPrice(...values) {
  return values.map(normalizePrice).find(Boolean) || "";
}

function parseJsonLd($) {
  const entries = [];
  $("script[type='application/ld+json']").each((_, element) => {
    try {
      const parsed = JSON.parse($(element).text());
      const candidates = Array.isArray(parsed) ? parsed : [parsed, ...(parsed?.["@graph"] || [])];
      entries.push(...candidates.filter(Boolean));
    } catch {
      // Ignore malformed JSON-LD blocks and keep other metadata sources.
    }
  });
  return entries.find((entry) => entry["@type"] === "Product" || entry.name || entry.offers) || {};
}

function flattenExtractedValue(value) {
  if (Array.isArray(value)) return value.flatMap(flattenExtractedValue);
  if (value && typeof value === "object") return Object.values(value).flatMap(flattenExtractedValue);
  const cleaned = cleanText(value);
  return cleaned ? [cleaned] : [];
}

function isGenericAvitoTitle(title) {
  const text = cleanText(title);
  return !text
    || /^товар с avito$/i.test(text)
    || /^(avito|авито)(?:\s|[—\-–:|]|$)/i.test(text)
    || /объявления на (сайте )?авито/i.test(text)
    || /сайт объявлений/i.test(text);
}

function normalizeImageUrl(imageUrl) {
  return upgradeAvitoImageUrl(imageUrl) || cleanText(imageUrl);
}

function normalizePrice(value) {
  const text = cleanText(value).replace(/&nbsp;|\u00a0/gi, " ");
  const match = text.match(/(\d[\d\s]*)(?:[.,](\d{1,2}))?/);
  if (!match) return "";
  const amount = `${match[1].replace(/\s+/g, " ").trim()}${match[2] ? `,${match[2]}` : ""}`;
  return amount ? `${amount} ₽` : "";
}

function isAvitoProductImage(imageUrl) {
  const value = normalizeImageUrl(imageUrl) || cleanText(imageUrl);
  if (!value) return false;
  if (/\/icons\/|touch-icon|favicon|apple-touch|\/logo|sprite|placeholder/i.test(value)) return false;
  let parsed;
  try {
    parsed = new URL(value.startsWith("//") ? `https:${value}` : value);
  } catch {
    return false;
  }
  if (!parsed.pathname || parsed.pathname.length < 8) return false;
  const hostOk = /avito\.st|static\.avito\.ru|avatars\.mds\.yandex\.net|(?:^|\.)avito\.ru$/i.test(parsed.hostname);
  const pathOk = /\/image\/|\/get-avito\/|\/img\/|\.(?:jpe?g|png|webp|avif)(?:$|\?)/i.test(value);
  return hostOk && pathOk;
}

function normalizeDescription(...values) {
  return [...new Set(values.flatMap(flattenExtractedValue))]
    .map(cleanText)
    .filter(Boolean)
    .join("\n\n");
}

function normalizeCharacteristics(value) {
  const entries = Array.isArray(value) ? value : [value];
  return entries.flatMap((entry, index) => {
    if (entry && typeof entry === "object") {
      const label = cleanText(entry.label || entry.name || entry.key);
      const itemValue = cleanText(entry.value || entry.text || entry.content);
      return label && itemValue ? [{ label, value: itemValue }] : [];
    }
    const text = cleanText(entry);
    if (!text) return [];
    const separator = text.match(/^(.+?)\s*[:\u2014-]\s*(.+)$/);
    return [{
      label: cleanText(separator?.[1] || `Характеристика ${index + 1}`),
      value: cleanText(separator?.[2] || text)
    }];
  }).slice(0, 12);
}

function decodeJsonString(value) {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return cleanText(value.replaceAll("\\u002F", "/").replaceAll("\\/", "/"));
  }
}

function cleanAvitoImageCandidate(value) {
  return cleanText(value)
    .replaceAll("\\u002F", "/")
    .replaceAll("\\/", "/")
    .replace(/[),;]+$/, "");
}

function splitImageCandidates(value) {
  return String(value || "")
    .split(",")
    .map((entry) => cleanAvitoImageCandidate(entry.trim().split(/\s+/)[0]))
    .filter(Boolean);
}

function getAvitoImageIdentity(value) {
  const url = cleanAvitoImageCandidate(value);
  return /\/image\/1\/1\.([A-Za-z0-9_-]{5})/.exec(url)?.[1] || "";
}

function extractEmbeddedAvitoTitle(html) {
  const matches = [...String(html || "").matchAll(/"(?:title|name|itemTitle)"\s*:\s*"((?:\\.|[^"\\])+)"/gi)];
  return matches
    .map((match) => decodeJsonString(match[1]))
    .find((title) => title && !isGenericAvitoTitle(title) && title.length >= 8 && title.length <= 180)
    || "";
}

function isGenericAvitoDescription(text) {
  const value = cleanText(text);
  return !value || isGenericAvitoTitle(value) || /объявления на (сайте )?авито/i.test(value);
}

function extractEmbeddedAvitoImages(html) {
  return [...String(html || "").matchAll(/https?:\\?\/\\?\/[^\s"'<>\\]+(?:avito\.st|avatars\.mds\.yandex\.net|static\.avito\.ru)[^\s"'<>\\]*/gi)]
    .map((match) => cleanAvitoImageCandidate(decodeJsonString(match[0])));
}

function extractAvitoGalleryImages($, html) {
  const galleryItems = $("[data-marker='image-preview/preview-wrapper'] [data-marker='image-preview/item'][data-type='image']")
    .toArray()
    .sort((left, right) => Number($(left).attr("data-index") || 0) - Number($(right).attr("data-index") || 0));
  if (!galleryItems.length) return [];

  const renderedImageUrls = new Set();
  $("img").each((_, image) => {
    for (const attribute of ["src", "srcset"]) {
      splitImageCandidates($(image).attr(attribute)).forEach((url) => renderedImageUrls.add(url));
    }
  });

  const embeddedImages = [...new Set(extractEmbeddedAvitoImages(html))];
  return galleryItems.map((item) => {
    const image = $(item).find("img[data-marker='image-preview/preview-image'], img").first();
    const source = image.attr("srcset") || image.attr("src") || "";
    const galleryFallback = normalizeImageUrl(pickLargestSrcsetUrl(source));
    const identity = getAvitoImageIdentity(galleryFallback || source);
    if (!identity) return galleryFallback;

    const stateImage = embeddedImages.find((candidate) => (
      getAvitoImageIdentity(candidate) === identity
      && !renderedImageUrls.has(candidate)
    ));
    return normalizeImageUrl(stateImage || galleryFallback);
  }).filter(Boolean);
}

function extractEmbeddedAvitoDescription(html) {
  const matches = [...String(html || "").matchAll(/"(?:description|fullDescription|detailedDescription)"\s*:\s*"((?:\\.|[^"\\])+)"/gi)];
  return matches
    .map((match) => decodeJsonString(match[1]))
    .filter((value) => value && !isGenericAvitoDescription(value) && value.length >= 40)
    .sort((left, right) => right.length - left.length)[0] || "";
}

function extractEmbeddedAvitoPrice(html) {
  const formatted = String(html || "").match(/"priceFormatted"\s*:\s*"((?:\\.|[^"\\])+)"/i);
  if (formatted) return decodeJsonString(formatted[1]);
  const numeric = String(html || "").match(/"(?:price|normalizedPrice)"\s*:\s*(\d{3,8})/i);
  return numeric?.[1] || "";
}

function extractAvitoProductId(productUrl, html = "", jsonLd = {}) {
  const urlMatch = productUrl.match(/(?:^|\/)(?:item\/)?[^/?#]*?_(\d+)(?:[/?#]|$)/i)
    || productUrl.match(/[?&](?:itemId|adId|id)=(\d+)/i);
  const htmlMatch = html.match(/"id"\s*:\s*"?(\d{6,})"?/i) || html.match(/item(?:Id|ID)"?\s*[:=]\s*"?(\d{6,})"?/i);
  return cleanText(urlMatch?.[1] || htmlMatch?.[1] || jsonLd.sku || jsonLd.productID || jsonLd.identifier);
}

function mergeCharacteristics(primary, secondary) {
  const seen = new Set();
  return [...primary, ...secondary].filter(({ label, value }) => {
    const key = `${cleanText(label)}:${cleanText(value)}`.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}

function mergeProducts(primary, secondary) {
  return buildAvitoProduct({
    productUrl: primary.productUrl || secondary.productUrl,
    fetchedAt: primary.fetchedAt || secondary.fetchedAt,
    title: primary.title && !isGenericAvitoTitle(primary.title) ? primary.title : secondary.title,
    description: !isGenericAvitoDescription(primary.description) && primary.description ? primary.description : secondary.description,
    images: [...(primary.images || []), ...(secondary.images || [])],
    characteristics: mergeCharacteristics(primary.characteristics || [], secondary.characteristics || []),
    price: primary.price || secondary.price,
    productId: primary.productId && primary.productId !== "unknown" ? primary.productId : secondary.productId,
    warnings: [...new Set([...(primary.warnings || []), ...(secondary.warnings || [])])],
    sourceMode: primary.sourceMode || secondary.sourceMode || "zenrows"
  });
}

function buildAvitoProduct({ productUrl, fetchedAt, title, description, images, characteristics, price, productId, warnings, sourceMode }) {
  const normalizedImages = [...new Set(images.filter(isAvitoProductImage).map(normalizeImageUrl).filter(Boolean))].slice(0, 12);
  const normalizedTitle = isGenericAvitoTitle(title) ? "" : cleanText(title);
  const normalizedDescription = isGenericAvitoDescription(description) ? "" : cleanText(description);
  const normalizedPrice = normalizePrice(price);
  const normalizedId = cleanText(productId) || "unknown";
  const sourceStatus = normalizedTitle && normalizedImages.length && normalizedId !== "unknown" ? "fetched" : "partial";

  return {
    platform: "Avito",
    productId: normalizedId,
    title: normalizedTitle || "Товар с Avito",
    description: normalizedDescription,
    images: normalizedImages,
    characteristics: normalizeCharacteristics(characteristics),
    price: normalizedPrice || null,
    priceWithoutWallet: normalizedPrice || null,
    productUrl,
    fetchedAt,
    sourceMode,
    sourceStatus,
    warnings
  };
}

export function parseAvitoHtml(html, productUrl, fetchedAt, sourceMode = "zenrows") {
  const $ = cheerio.load(html);
  const jsonLd = parseJsonLd($);
  const offers = Array.isArray(jsonLd.offers) ? jsonLd.offers[0] : jsonLd.offers || {};

  const title = [
    jsonLd.name,
    $("h1").first().text(),
    $("[data-marker='item-view/title-info']").first().text(),
    $("meta[property='og:title']").attr("content"),
    $("meta[name='twitter:title']").attr("content"),
    extractEmbeddedAvitoTitle(html),
    $("title").first().text()
  ].map(cleanText).find((value) => value && !isGenericAvitoTitle(value)) || "";
  const description = [
    $("[data-marker='item-view/item-description']").text(),
    $("[itemprop='description']").first().text(),
    jsonLd.description,
    extractEmbeddedAvitoDescription(html),
    $("meta[property='og:description']").attr("content"),
    $("meta[name='description']").attr("content")
  ].map(cleanText).find((value) => value && !isGenericAvitoDescription(value)) || "";
  const price = firstPrice(
    offers.price,
    jsonLd.price,
    $("meta[itemprop='price']").attr("content"),
    $("meta[property='product:price:amount']").attr("content"),
    $("[data-marker='item-view/item-price']").text(),
    $("[data-marker*='item-price']").first().text(),
    $("[itemprop='price']").first().text(),
    extractEmbeddedAvitoPrice(html),
    html.match(/"price"\s*:\s*"?(\d[\d\s.,]*)"?/i)?.[1]
  );
  const metaImages = [
    ...(Array.isArray(jsonLd.image) ? jsonLd.image : [jsonLd.image]),
    $("meta[property='og:image']").attr("content"),
    $("meta[name='twitter:image']").attr("content")
  ];
  const htmlImages = [
    ...[...html.matchAll(/https?:\/\/[^\s"'<>\\]+(?:img\.avito\.st|avito\.st\/image|avatars\.mds\.yandex\.net\/get-avito)[^\s"'<>\\]+/gi)].map((match) => match[0]),
    ...extractEmbeddedAvitoImages(html)
  ];
  const galleryImages = extractAvitoGalleryImages($, html);
  const productImages = galleryImages.length ? galleryImages : [...metaImages, ...htmlImages];
  const characteristics = [
    ...$("[data-marker='item-view/item-params'] li, [data-marker*='item-params'] li").toArray().map((element) => ({
      label: cleanText($(element).find("span").first().text()),
      value: cleanText($(element).find("span").last().text())
    })),
    ...$("[itemprop='additionalProperty']").toArray().map((element) => ({
      label: cleanText($(element).attr("content") || $(element).find("[itemprop='name']").text()),
      value: cleanText($(element).find("[itemprop='value']").attr("content") || $(element).find("[itemprop='value']").text())
    }))
  ];
  const productId = extractAvitoProductId(productUrl, html, jsonLd);
  const warnings = [];

  if (!title) warnings.push("Название не найдено в публичной разметке Avito.");
  if (!description) warnings.push("Описание не найдено в публичной разметке Avito.");
  if (!price) warnings.push("Цена не найдена в публичной разметке Avito.");
  if (!productImages.length) warnings.push("Изображения не найдены в публичной разметке Avito.");
  if (!productId) warnings.push("ID объявления не найден в URL или метаданных Avito.");

  return buildAvitoProduct({
    productUrl,
    fetchedAt,
    title,
    description,
    images: productImages,
    characteristics,
    price,
    productId,
    warnings,
    sourceMode
  });
}

function parseAvitoExtractedJson(payload, productUrl, fetchedAt) {
  const extracted = payload?.data && typeof payload.data === "object" && !Array.isArray(payload.data)
    ? payload.data
    : payload;
  const warnings = [];
  const title = firstNonEmpty(extracted?.title, extracted?.heading, extracted?.name);
  const description = normalizeDescription(
    extracted?.description,
    extracted?.description_paragraphs,
    extracted?.description_block,
    extracted?.description_text
  );
  const price = firstPrice(extracted?.amount, extracted?.offer_price, extracted?.price);
  const imageCandidates = [
    ...flattenExtractedValue(extracted?.image),
    ...flattenExtractedValue(extracted?.gallery),
    ...flattenExtractedValue(extracted?.image_data),
    ...flattenExtractedValue(extracted?.image_src)
  ];
  const characteristics = normalizeCharacteristics(extracted?.characteristics || extracted?.params || extracted?.attributes);
  const productId = extractAvitoProductId(productUrl, "", extracted);

  if (!title) warnings.push("Название не найдено в CSS Extractor-ответе Avito.");
  if (!description) warnings.push("Описание не найдено в CSS Extractor-ответе Avito.");
  if (!price) warnings.push("Цена не найдена в CSS Extractor-ответе Avito.");
  if (!imageCandidates.length) warnings.push("Изображения не найдены в CSS Extractor-ответе Avito.");
  if (!productId) warnings.push("ID объявления не найден в CSS Extractor-ответе Avito.");

  return buildAvitoProduct({
    productUrl,
    fetchedAt,
    title,
    description,
    images: imageCandidates,
    characteristics,
    price,
    productId,
    warnings,
    sourceMode: "zenrows"
  });
}

export async function fetchAvitoProductViaZenRows(productUrl) {
  const params = new URLSearchParams({
    apikey: process.env.ZENROWS_API_KEY,
    url: productUrl,
    js_render: "true",
    premium_proxy: "true",
    proxy_country: "ru",
    wait_for: "[data-marker='item-view/item-description']",
    wait: "1000"
  });

  async function requestZenRows(searchParams) {
    const response = await fetch(`https://api.zenrows.com/v1/?${searchParams}`, {
      signal: AbortSignal.timeout(45_000)
    });
    const body = await response.text();
    if (!response.ok) {
      const detail = cleanText(body).slice(0, 240);
      const error = new Error(`ZenRows вернул HTTP ${response.status}${detail ? `: ${detail}` : "."}`);
      error.statusCode = response.status;
      throw error;
    }
    return { response, body };
  }

  function parseZenRowsResult({ response, body }) {
    const contentType = response.headers.get("content-type") || "";
    const fetchedAt = new Date().toISOString();
    if (!body) throw new Error("ZenRows не вернул HTML страницы Avito.");

    if (!contentType.includes("application/json") && !body.trim().startsWith("{") && !body.trim().startsWith("[")) {
      return parseAvitoHtml(body, productUrl, fetchedAt, "zenrows");
    }

    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      throw new Error("ZenRows вернул некорректный JSON-ответ для Avito.");
    }

    const html = payload.html || payload.data?.html || payload.outputCode?.html || "";
    const extractedProduct = parseAvitoExtractedJson(payload, productUrl, fetchedAt);
    return html
      ? mergeProducts(extractedProduct, parseAvitoHtml(html, productUrl, fetchedAt, "zenrows"))
      : extractedProduct;
  }

  function productScore(product) {
    if (!product) return 0;
    return Number(Boolean(product.title && !isGenericAvitoTitle(product.title))) * 3
      + Number(Boolean(product.description)) * 3
      + Number(Boolean(product.price)) * 2
      + Number(Boolean(product.images?.length)) * 2
      + Number(Boolean(product.characteristics?.length));
  }

  let bestProduct = null;
  let lastError = null;
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const product = parseZenRowsResult(await requestZenRows(params));
      if (productScore(product) > productScore(bestProduct)) bestProduct = product;
      if (product.sourceStatus === "fetched" && product.description) {
        if (attempt > 1) product.warnings.push(`Карточка Avito получена с попытки ${attempt} из ${maxAttempts}.`);
        return product;
      }
    } catch (error) {
      lastError = error;
      const retryableStatus = !error.statusCode || error.statusCode === 408 || error.statusCode === 429 || error.statusCode >= 500;
      if (!retryableStatus) throw error;
    }
  }

  if (bestProduct) {
    bestProduct.warnings.push("ZenRows исчерпал одну повторную попытку; использован наиболее полный ответ Avito.");
    return bestProduct;
  }
  throw lastError || new Error("ZenRows не вернул карточку Avito после двух попыток.");
}
