function firstUrlToken(value) {
  return String(value || "").trim().split(/\s+/)[0] || "";
}

export function pickLargestSrcsetUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const entries = text.split(",").map((part) => part.trim()).filter(Boolean);
  if (entries.length <= 1 && !/\s+\d/.test(text)) return firstUrlToken(text);

  let bestUrl = "";
  let bestScore = -1;
  for (const entry of entries) {
    const tokens = entry.split(/\s+/);
    const url = tokens[0];
    const descriptor = tokens.slice(1).join(" ");
    const width = Number(/(\d+)w/i.exec(descriptor)?.[1] || 0);
    const density = Number(/([\d.]+)x/i.exec(descriptor)?.[1] || 0);
    const urlWidth = Number(/(\d{3,4})x\d{3,4}/.exec(url)?.[1] || 0);
    const score = width || urlWidth || (density ? density * 1000 : 0);
    if (url && score >= bestScore) {
      bestUrl = url;
      bestScore = score;
    }
  }

  return bestUrl || firstUrlToken(entries[0] || text);
}

export function upgradeWbImageUrl(imageUrl) {
  return String(imageUrl || "").replace(/\/(?:c\d+x\d+|tm|square|hq|big)\//i, "/big/");
}

export function upgradeAvitoImageUrl(imageUrl) {
  let value = pickLargestSrcsetUrl(imageUrl);
  if (!value) return "";
  if (value.startsWith("//")) value = `https:${value}`;
  if (value.startsWith("/")) value = `https://www.avito.ru${value}`;
  return value
    .replace(/(\/get-avito\/[^/?#]+\/[^/?#]+)\/\d+x\d+/i, "$1/orig")
    .replace(/\/\d{2,4}x\d{2,4}(?=\/)/g, "/1280x960")
    .replace(/_(\d{2,4}x\d{2,4})(?=\.(?:jpe?g|png|webp|avif)\b|$)/i, "_1280x960");
}

export function upgradeProductImageUrl(imageUrl, platform = "") {
  const value = String(imageUrl || "").trim();
  if (!value) return "";
  const text = `${platform} ${value}`.toLowerCase();
  if (text.includes("wildberries") || text.includes("wbbasket") || /\bwb\b/.test(text)) {
    return upgradeWbImageUrl(value);
  }
  if (text.includes("avito") || text.includes("avatars.mds.yandex.net")) {
    return upgradeAvitoImageUrl(value);
  }
  return value;
}
