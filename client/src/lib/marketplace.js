const MARKETPLACE_META = {
  wb: {
    key: "wb",
    label: "WB",
    fullLabel: "Wildberries",
    shortLabel: "wb",
    badgeClassName: "from-fuchsia-500 via-violet-600 to-indigo-600",
    priceLabel: "Цена без WB Кошелька",
    defaultTitle: "Товар с Wildberries"
  },
  avito: {
    key: "avito",
    label: "Avito",
    fullLabel: "Avito",
    shortLabel: "av",
    badgeClassName: "from-sky-500 via-blue-500 to-orange-400",
    priceLabel: "Цена",
    defaultTitle: "Товар с Avito"
  },
  unknown: {
    key: "unknown",
    label: "Маркетплейс",
    fullLabel: "Маркетплейс",
    shortLabel: "url",
    badgeClassName: "from-slate-500 via-slate-600 to-slate-700",
    priceLabel: "Цена",
    defaultTitle: "Товар из маркетплейса"
  }
};

export function normalizeMarketplace(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return null;
  if (text === "wb" || text.includes("wildberries")) return "wb";
  if (text === "avito") return "avito";
  return null;
}

export function detectMarketplaceFromUrl(productUrl) {
  try {
    const host = new URL(String(productUrl || "").trim()).hostname.toLowerCase();
    if (host === "wildberries.ru" || host.endsWith(".wildberries.ru")) return "wb";
    if (host === "avito.ru" || host.endsWith(".avito.ru")) return "avito";
    return null;
  } catch {
    return null;
  }
}

export function resolveMarketplace(productUrl, marketplaceMode = "auto") {
  const explicitMarketplace = normalizeMarketplace(marketplaceMode);
  return explicitMarketplace || detectMarketplaceFromUrl(productUrl);
}

export function getMarketplaceMeta(value) {
  const marketplace = normalizeMarketplace(value);
  return MARKETPLACE_META[marketplace] || MARKETPLACE_META.unknown;
}

export function isFallbackProductTitle(title, marketplaceValue) {
  if (!title) return true;
  const normalizedTitle = String(title).trim().toLowerCase();
  if (/интернет.?магазин wildberries/i.test(normalizedTitle)) return true;
  if (/^(avito|авито)(?:\s|[—\-–:|]|$)/i.test(normalizedTitle) || /объявления на (сайте )?авито|сайт объявлений/i.test(normalizedTitle)) return true;
  const marketplace = normalizeMarketplace(marketplaceValue);
  const fallbackTitles = [
    MARKETPLACE_META.unknown.defaultTitle,
    MARKETPLACE_META.wb.defaultTitle,
    MARKETPLACE_META.avito.defaultTitle
  ];
  if (marketplace) fallbackTitles.push(getMarketplaceMeta(marketplace).defaultTitle);
  return fallbackTitles.some((value) => value.toLowerCase() === normalizedTitle);
}

export function validateMarketplaceSelection(productUrl, marketplaceMode = "auto") {
  const trimmedUrl = String(productUrl || "").trim();
  if (!trimmedUrl) return null;

  let parsedUrl;
  try {
    parsedUrl = new URL(trimmedUrl);
  } catch {
    return "Введите корректную ссылку на товар.";
  }

  const detectedMarketplace = detectMarketplaceFromUrl(parsedUrl.toString());
  if (!detectedMarketplace) {
    return "Сейчас поддерживаются только публичные ссылки Wildberries и Avito.";
  }

  const explicitMarketplace = normalizeMarketplace(marketplaceMode);
  if (explicitMarketplace && explicitMarketplace !== detectedMarketplace) {
    return `Ссылка ведёт на ${getMarketplaceMeta(detectedMarketplace).fullLabel}, а выбран ${getMarketplaceMeta(explicitMarketplace).fullLabel}.`;
  }

  return null;
}

export function getPriceLabel(product) {
  return getMarketplaceMeta(product?.platform || product?.marketplace).priceLabel;
}

export function getDefaultCtaText(product) {
  return `Купить на ${getMarketplaceMeta(product?.platform || product?.marketplace).label}`;
}

export function getMarketplaceLinkLabel(record) {
  return getMarketplaceMeta(record?.platform || record?.marketplace || detectMarketplaceFromUrl(record?.productUrl)).label;
}

export function upgradeDisplayImageUrl(imageUrl, product) {
  const value = String(imageUrl || "").trim();
  if (!value) return "";
  const marketplace = normalizeMarketplace(product?.platform || product?.marketplace);
  if (marketplace === "wb" || /wbbasket\.ru|wildberries/i.test(value)) {
    return value.replace(/\/(?:c\d+x\d+|tm|square|hq|big)\//i, "/big/");
  }
  if (marketplace === "avito" || /avito\.st|avatars\.mds\.yandex\.net/i.test(value)) {
    return value
      .replace(/(\/get-avito\/[^/?#]+\/[^/?#]+)\/\d+x\d+/i, "$1/orig")
      .replace(/\/\d{2,4}x\d{2,4}(?=\/)/g, "/1280x960")
      .replace(/_(\d{2,4}x\d{2,4})(?=\.(?:jpe?g|png|webp|avif)\b|$)/i, "_1280x960");
  }
  return value;
}

export function thumbnailDisplayUrl(imageUrl, product) {
  const upgraded = upgradeDisplayImageUrl(imageUrl, product);
  if (normalizeMarketplace(product?.platform || product?.marketplace) === "wb") {
    return upgraded.replace(/\/(?:c\d+x\d+|big|hq|square|tm)\//i, "/c246x328/");
  }
  return upgraded;
}
