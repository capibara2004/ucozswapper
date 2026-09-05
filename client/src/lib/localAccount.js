import { detectMarketplaceFromUrl, getMarketplaceMeta, normalizeMarketplace } from "./marketplace";

const STORAGE_KEY = "ucoz-market-page-account-v1";

function createUserId() {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `local_${id}`;
}

function persist(account) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
  return account;
}

function normalizePublication(record) {
  const marketplace = normalizeMarketplace(record?.marketplace || record?.platform || detectMarketplaceFromUrl(record?.productUrl));
  return {
    ...record,
    marketplace: marketplace || null,
    platform: getMarketplaceMeta(marketplace).label
  };
}

export function loadOrCreateLocalAccount() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (stored?.userId && Array.isArray(stored.publications)) {
      const normalizedPublications = stored.publications.map(normalizePublication);
      const account = { ...stored, publications: normalizedPublications };
      const changed = JSON.stringify(account) !== JSON.stringify(stored);
      return changed ? persist(account) : account;
    }
  } catch {
    // Corrupted browser data is replaced with a clean local account.
  }

  return persist({
    userId: createUserId(),
    createdAt: new Date().toISOString(),
    publications: []
  });
}

export function recordSuccessfulPublication(account, publication, product) {
  if (!publication?.published || !publication?.url || !publication?.operationId) return account;
  const marketplace = normalizeMarketplace(product?.platform || detectMarketplaceFromUrl(product?.productUrl));

  const record = {
    operationId: publication.operationId,
    createdAt: new Date().toISOString(),
    title: product.title,
    previewImage: product.images?.[0] || null,
    productUrl: product.productUrl,
    publishedUrl: publication.url,
    productId: product.productId,
    model: publication.model || null,
    marketplace: marketplace || null,
    platform: getMarketplaceMeta(marketplace).label
  };

  return persist({
    ...account,
    publications: [record, ...account.publications.filter((item) => item.operationId !== record.operationId)].slice(0, 50)
  });
}
