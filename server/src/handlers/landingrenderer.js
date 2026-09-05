import { upgradeProductImageUrl } from "../lib/imageQuality.js";

const presets = new Set(["spotlight", "editorial", "spec-driven", "red_dark", "green_dark", "toxic", "midnight"]);
const accents = new Set(["violet", "electric-blue", "emerald", "coral"]);
const heroLayouts = new Set(["media-left", "media-right"]);
const sliders = new Set(["rail", "cards", "cinematic"]);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeHttpUrl(value, fallback = "#") {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

function stableIndex(value, length) {
  return [...String(value || "ucoz-swapper")]
    .reduce((sum, character) => (sum * 31 + character.codePointAt(0)) >>> 0, 7) % length;
}

function descriptionParagraphs(value) {
  const text = String(value || "").replace(/\r/g, "").trim();
  if (!text) return [];

  const explicitParagraphs = text
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (explicitParagraphs.length > 1) return explicitParagraphs.slice(0, 8);

  const sentences = (explicitParagraphs[0] || text)
    .split(/(?<=[.!?])\s+(?=[А-ЯA-ZА-ЯЁ0-9«])/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (sentences.length < 4) return [explicitParagraphs[0] || text];

  const paragraphs = [];
  for (let index = 0; index < sentences.length; index += 3) {
    paragraphs.push(sentences.slice(index, index + 3).join(" "));
  }
  return paragraphs.slice(0, 8);
}

export function resolveLandingDesign(product, content) {
  const fallbackPresets = ["spotlight", "editorial", "spec-driven", "red_dark", "green_dark", "toxic", "midnight"];
  const fallbackAccents = ["violet", "electric-blue", "emerald", "coral"];
  const fallbackSliders = ["rail", "cards", "cinematic"];
  const fingerprint = `${product.productId}:${product.title}`;
  return {
    preset: presets.has(content.design?.preset)
      ? content.design.preset
      : fallbackPresets[stableIndex(fingerprint, fallbackPresets.length)],
    accent: accents.has(content.design?.accent)
      ? content.design.accent
      : fallbackAccents[stableIndex(`${fingerprint}:accent`, fallbackAccents.length)],
    heroLayout: heroLayouts.has(content.design?.heroLayout)
      ? content.design.heroLayout
      : stableIndex(`${fingerprint}:layout`, 2) ? "media-right" : "media-left",
    slider: sliders.has(content.design?.slider)
      ? content.design.slider
      : fallbackSliders[stableIndex(`${fingerprint}:slider`, fallbackSliders.length)]
  };
}

function structuredProduct(product, content, productUrl) {
  const numericPrice = String(product.priceWithoutWallet || product.price || "")
    .replace(/[^\d,.-]/g, "")
    .replace(",", ".");
  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description || content.hero.subheadline,
    image: (product.images || []).map((image) => safeHttpUrl(upgradeProductImageUrl(image, product.platform), "")).filter(Boolean),
    sku: product.productId
  };
  if (numericPrice && Number.isFinite(Number(numericPrice))) {
    data.offers = {
      "@type": "Offer",
      url: productUrl,
      priceCurrency: "RUB",
      price: numericPrice
    };
  }
  return JSON.stringify(data).replaceAll("<", "\\u003c");
}

export function renderLandingHtml(product, content) {
  const design = resolveLandingDesign(product, content);
  const images = (product.images || []).map((image) => upgradeProductImageUrl(image, product.platform));
  const imageUrl = safeHttpUrl(upgradeProductImageUrl(content.hero.image || images[0] || "", product.platform), "");
  const productUrl = safeHttpUrl(content.cta.url, safeHttpUrl(product.productUrl));
  const price = product.priceWithoutWallet || product.price || "Цена уточняется";
  const imageAlt = `${product.title} — фото товара`;
  const benefits = content.benefits
    .map((item, index) => `<li><span>${String(index + 1).padStart(2, "0")}</span><p>${escapeHtml(item)}</p></li>`)
    .join("");
  const specifications = content.specifications
    .map(({ label, value }) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`)
    .join("");
  const faq = content.faq
    .map(({ question, answer }) => `<details><summary>${escapeHtml(question)}<span>+</span></summary><p>${escapeHtml(answer)}</p></details>`)
    .join("");
  const description = descriptionParagraphs(product.description || content.hero.subheadline)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
  const gallery = images
    .slice(0, 8)
    .map((image, index) => `<figure class="gallery-card"><img src="${escapeHtml(safeHttpUrl(image))}" alt="${escapeHtml(product.title)} — фото ${index + 1}" loading="lazy"><figcaption>${String(index + 1).padStart(2, "0")}</figcaption></figure>`)
    .join("");
  const bodyClass = `preset-${design.preset} accent-${design.accent} layout-${design.heroLayout} slider-${design.slider}`;

  return `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(content.seo.title)}</title>
<meta name="description" content="${escapeHtml(content.seo.description)}">
<meta name="keywords" content="${escapeHtml(content.seo.keywords.join(", "))}">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="product"><meta property="og:locale" content="ru_RU">
<meta property="og:title" content="${escapeHtml(content.seo.title)}">
<meta property="og:description" content="${escapeHtml(content.seo.description)}">
${imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}">` : ""}
<script type="application/ld+json">${structuredProduct(product, content, productUrl)}</script>
<style>
:root{--ink:#10131b;--muted:#6b7280;--paper:#fbfaf7;--panel:#fff;--line:rgba(16,19,27,.1);--accent:#7c3aed;--accent-2:#a855f7;--accent-soft:rgba(124,58,237,.1);--cta-panel:#10131b;--cta-ink:#f8fafc;font-family:Inter,Arial,sans-serif;color:var(--ink);background:var(--paper)}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:radial-gradient(circle at 8% 2%,var(--accent-soft),transparent 34rem),var(--paper);color:var(--ink)}a{color:inherit}img{display:block;max-width:100%}.page{width:min(1180px,calc(100% - 40px));margin:auto}.accent-electric-blue{--accent:#2563eb;--accent-2:#06b6d4;--accent-soft:rgba(37,99,235,.11)}.accent-emerald{--accent:#059669;--accent-2:#22c55e;--accent-soft:rgba(5,150,105,.11)}.accent-coral{--accent:#e84c3d;--accent-2:#fb7185;--accent-soft:rgba(232,76,61,.11)}
.preset-red_dark{--ink:#fff1f2;--muted:#f0a4ae;--paper:#100407;--panel:#1d090e;--line:rgba(251,113,133,.24);--accent:#ff315d;--accent-2:#f97316;--accent-soft:rgba(255,49,93,.16);--cta-panel:#2a080f;--cta-ink:#fff1f2;color-scheme:dark}
.preset-green_dark{--ink:#ecfdf5;--muted:#9bd3bc;--paper:#04110c;--panel:#0a2118;--line:rgba(52,211,153,.2);--accent:#21d98b;--accent-2:#a3e635;--accent-soft:rgba(33,217,139,.14);--cta-panel:#08291c;--cta-ink:#ecfdf5;color-scheme:dark}
.preset-toxic{--ink:#f7fee7;--muted:#bfd886;--paper:#070b02;--panel:#111907;--line:rgba(190,242,100,.24);--accent:#b7ff25;--accent-2:#f5ff3b;--accent-soft:rgba(183,255,37,.16);--cta-panel:#182506;--cta-ink:#071000;color-scheme:dark}
.preset-midnight{--ink:#eff6ff;--muted:#9fb6d8;--paper:#030712;--panel:#0a1225;--line:rgba(96,165,250,.22);--accent:#60a5fa;--accent-2:#22d3ee;--accent-soft:rgba(96,165,250,.15);--cta-panel:#0b1730;--cta-ink:#eff6ff;color-scheme:dark}
.topbar{display:flex;align-items:center;justify-content:flex-end;padding:22px 0;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.source{color:var(--muted)}
.hero{display:grid;grid-template-columns:minmax(0,.96fr) minmax(0,1.04fr);gap:clamp(28px,6vw,88px);align-items:center;min-height:680px;padding:42px 0 76px}.hero-media{position:relative;min-height:580px;border-radius:5px;background:transparent;overflow:hidden}.hero-media>img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}.hero-copy{padding:24px 0}.layout-media-right .hero-media{order:2}.layout-media-right .hero-copy{order:1}.eyebrow{margin:0;color:var(--accent);font-size:12px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}.hero h1{max-width:760px;margin:18px 0 20px;font-size:clamp(44px,6.2vw,86px);font-weight:900;letter-spacing:-.065em;line-height:.92}.lead{max-width:650px;margin:0;color:var(--muted);font-size:clamp(17px,2vw,21px);line-height:1.55}.price{display:block;margin-top:30px;font-size:clamp(30px,4vw,48px);font-weight:900;letter-spacing:-.04em}.actions{display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin-top:24px}.cta{display:inline-flex;align-items:center;gap:12px;padding:17px 22px;border-radius:5px;background:var(--accent);color:#fff;text-decoration:none;font-weight:900;box-shadow:0 16px 40px var(--accent-soft);transition:transform .2s ease,filter .2s ease}.cta:hover{transform:translateY(-3px);filter:brightness(.94)}.cta-note{max-width:250px;color:var(--muted);font-size:12px;line-height:1.45}
.section{padding:74px 0}.section-kicker{margin:0 0 10px;color:var(--accent);font-size:11px;font-weight:900;letter-spacing:.15em;text-transform:uppercase}.section h2{max-width:800px;margin:0 0 30px;font-size:clamp(32px,4.5vw,56px);letter-spacing:-.055em;line-height:1}.benefits{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0;padding:0;list-style:none}.benefits li{min-height:170px;padding:24px;border-radius:5px;background:var(--panel);box-shadow:0 18px 55px rgba(17,24,39,.06)}.benefits span{color:var(--accent);font-size:12px;font-weight:900}.benefits p{margin:30px 0 0;font-size:17px;font-weight:750;line-height:1.4}
.content-stack{display:grid;gap:16px}.story,.spec-wrap{padding:clamp(24px,4vw,48px);background:var(--panel);border-radius:5px}.story-copy{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px clamp(24px,4vw,54px)}.story-copy p{margin:0;color:var(--muted);font-size:17px;line-height:1.8}.specs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 clamp(24px,4vw,54px);margin:0}.specs div{display:grid;grid-template-columns:minmax(120px,.8fr) minmax(0,1.2fr);gap:20px;padding:14px 0;border-bottom:1px solid var(--line)}.specs dt{color:var(--muted);font-size:12px;font-weight:800;text-transform:uppercase}.specs dd{margin:0;font-size:14px;font-weight:750;overflow-wrap:anywhere}.gallery-shell{position:relative}.gallery{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;overscroll-behavior-inline:contain}.gallery::-webkit-scrollbar{display:none}.gallery-card{position:relative;flex:0 0 clamp(220px,27vw,330px);margin:0;overflow:hidden;scroll-snap-align:start;background:transparent;border-radius:5px}.gallery-card img{width:100%;aspect-ratio:3/4;object-fit:cover;background:transparent}.gallery-card figcaption{position:absolute;right:10px;bottom:10px;padding:7px 9px;border-radius:5px;background:color-mix(in srgb,var(--paper) 78%,transparent);color:var(--ink);font-size:11px;font-weight:900;backdrop-filter:blur(10px)}.gallery-controls{display:flex;justify-content:flex-end;gap:8px;margin-bottom:12px}.gallery-control{display:grid;width:42px;height:42px;place-items:center;border:1px solid var(--line);border-radius:5px;background:var(--panel);color:var(--ink);cursor:pointer;font-size:20px}.gallery-control:hover{color:var(--accent);border-color:var(--accent)}.slider-rail .gallery-card{flex-basis:clamp(180px,23vw,270px)}.slider-cards .gallery{padding:18px 4px 28px}.slider-cards .gallery-card{flex-basis:clamp(250px,34vw,410px);box-shadow:0 24px 60px rgba(0,0,0,.13)}.slider-cards .gallery-card:nth-child(even){transform:translateY(16px)}.slider-cinematic .gallery-card{flex-basis:min(88%,900px)}.slider-cinematic .gallery-card img{aspect-ratio:16/9;object-fit:contain}.slider-cinematic .gallery-card figcaption{font-size:13px}
.faq{display:grid;gap:2px}.faq details{padding:20px 0;border-bottom:1px solid var(--line)}.faq summary{display:flex;justify-content:space-between;gap:20px;cursor:pointer;font-size:17px;font-weight:850;list-style:none}.faq summary::-webkit-details-marker{display:none}.faq summary span{color:var(--accent);font-size:24px}.faq p{max-width:760px;margin:14px 0 0;color:var(--muted);line-height:1.7}.final-cta{margin:40px 0 80px;padding:clamp(30px,6vw,74px);border-radius:5px;background:var(--cta-panel);color:var(--cta-ink)}.final-cta h2{max-width:800px;margin:0;font-size:clamp(38px,6vw,72px);letter-spacing:-.06em;line-height:.95}.final-cta p{max-width:620px;color:var(--muted);line-height:1.7}.final-cta .cta{background:var(--accent)}
.preset-editorial .hero{grid-template-columns:minmax(0,.82fr) minmax(0,1.18fr)}.preset-editorial .hero-media{min-height:650px}.preset-editorial .hero h1{font-family:Georgia,serif;font-weight:700;letter-spacing:-.05em}.preset-editorial .benefits{grid-template-columns:repeat(2,minmax(0,1fr))}.preset-spec-driven .hero{min-height:600px}.preset-spec-driven .hero-media{min-height:500px}
:is(.preset-red_dark,.preset-green_dark,.preset-toxic,.preset-midnight) .benefits li{box-shadow:inset 0 0 0 1px var(--line),0 18px 60px rgba(0,0,0,.22)}
.preset-red_dark .hero h1{font-family:Georgia,serif;text-shadow:0 0 42px rgba(255,49,93,.24)}.preset-red_dark .benefits li{border-left:3px solid var(--accent)}
.preset-green_dark .section h2{color:#d7ffea}
.preset-toxic .hero h1,.preset-toxic .section h2{text-transform:uppercase;letter-spacing:-.035em}.preset-toxic .cta{color:#071000;box-shadow:0 0 38px rgba(183,255,37,.22)}.preset-toxic .benefits li{outline:1px solid rgba(183,255,37,.18)}
body.preset-midnight{background:radial-gradient(circle at 70% 4%,rgba(34,211,238,.12),transparent 32rem),radial-gradient(circle at 4% 24%,rgba(96,165,250,.12),transparent 34rem),var(--paper)}.preset-midnight .hero h1{background:linear-gradient(120deg,#f8fafc,#93c5fd 65%,#67e8f9);background-clip:text;color:transparent}
.mobile-buy{display:none}
@media(max-width:820px){.page{width:min(100% - 28px,680px)}.hero{grid-template-columns:1fr;min-height:0;padding:20px 0 42px}.hero-media,.preset-editorial .hero-media,.preset-spec-driven .hero-media{min-height:480px;order:1!important}.hero-copy{order:2!important}.hero h1{font-size:48px}.benefits,.preset-editorial .benefits,.story-copy,.specs{grid-template-columns:1fr}.benefits li{min-height:0}.gallery{grid-template-columns:repeat(2,1fr)}.section{padding:48px 0}.mobile-buy{position:sticky;z-index:20;bottom:0;display:flex;align-items:center;justify-content:space-between;gap:14px;margin:0 -14px;padding:12px 18px;background:rgba(16,19,27,.94);color:#fff;backdrop-filter:blur(16px)}.mobile-buy strong{font-size:18px}.mobile-buy .cta{padding:12px 15px;font-size:13px}}
@media(max-width:480px){.hero-media,.preset-editorial .hero-media,.preset-spec-driven .hero-media{min-height:390px}.hero h1{font-size:40px}.specs div{grid-template-columns:1fr;gap:5px}.gallery{gap:6px}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.cta{transition:none}}
</style></head>
<body class="${bodyClass}"><main class="page">
<header class="topbar"><span class="source">${escapeHtml(product.platform)} · ${escapeHtml(product.productId)}</span></header>
<section class="hero">
  <div class="hero-media">${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(imageAlt)}">` : ""}</div>
  <div class="hero-copy"><p class="eyebrow">${escapeHtml(content.hero.eyebrow)}</p><h1>${escapeHtml(content.hero.headline)}</h1><p class="lead">${escapeHtml(content.hero.subheadline)}</p><strong class="price">${escapeHtml(price)}</strong><div class="actions"><a class="cta" href="${escapeHtml(productUrl)}" target="_blank" rel="nofollow noopener noreferrer">${escapeHtml(content.cta.text)} <span>↗</span></a><span class="cta-note">${escapeHtml(content.cta.supportingText)}</span></div></div>
</section>
<section class="section"><p class="section-kicker">Главное о товаре</p><h2>Почему стоит обратить внимание</h2><ul class="benefits">${benefits}</ul></section>
<section class="section content-stack"><article class="story"><p class="section-kicker">О товаре</p><h2>${escapeHtml(product.title)}</h2><div class="story-copy">${description}</div></article>${specifications ? `<article class="spec-wrap"><p class="section-kicker">Детали</p><h2>Характеристики</h2><dl class="specs">${specifications}</dl></article>` : ""}</section>
${gallery ? `<section class="section"><p class="section-kicker">В деталях</p><h2>Галерея товара</h2><div class="gallery-shell"><div class="gallery-controls"><button class="gallery-control" type="button" data-gallery-prev aria-label="Предыдущие фотографии">←</button><button class="gallery-control" type="button" data-gallery-next aria-label="Следующие фотографии">→</button></div><div class="gallery" data-gallery>${gallery}</div></div></section>` : ""}
${faq ? `<section class="section"><p class="section-kicker">Ответы перед покупкой</p><h2>Частые вопросы</h2><div class="faq">${faq}</div></section>` : ""}
<section class="final-cta"><h2>${escapeHtml(content.hero.headline)}</h2><p>${escapeHtml(content.cta.supportingText)}</p><a class="cta" href="${escapeHtml(productUrl)}" target="_blank" rel="nofollow noopener noreferrer">${escapeHtml(content.cta.text)} <span>↗</span></a></section>
<div class="mobile-buy"><strong>${escapeHtml(price)}</strong><a class="cta" href="${escapeHtml(productUrl)}" target="_blank" rel="nofollow noopener noreferrer">${escapeHtml(content.cta.text)}</a></div>
</main>
<script>(()=>{const track=document.querySelector('[data-gallery]');if(!track)return;const move=(direction)=>track.scrollBy({left:direction*Math.max(track.clientWidth*.72,260),behavior:'smooth'});document.querySelector('[data-gallery-prev]')?.addEventListener('click',()=>move(-1));document.querySelector('[data-gallery-next]')?.addEventListener('click',()=>move(1));})();</script>
</body></html>`;
}
