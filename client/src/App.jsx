import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Clock3,
  Eye,
  ExternalLink,
  Link2,
  Moon,
  Send,
  ShieldCheck,
  Sparkles,
  Sun,
  WandSparkles,
  Zap
} from "lucide-react";
import ProductCardPreview from "./components/ProductCardPreview";
import LandingPreview from "./components/LandingPreview";
import LocalAccount from "./components/LocalAccount";
import UapiPublishModal from "./components/UapiPublishModal";
import ZenRowsErrorModal from "./components/ZenRowsErrorModal";
import { loadOrCreateLocalAccount, recordSuccessfulPublication } from "./lib/localAccount";
import {
  detectMarketplaceFromUrl,
  getMarketplaceMeta,
  isFallbackProductTitle,
  normalizeMarketplace,
  resolveMarketplace,
  validateMarketplaceSelection
} from "./lib/marketplace";
import ucozSwapperLogo from "./assets/uCozSwapper-logotype.svg";

function loadInitialTheme() {
  const savedTheme = window.localStorage.getItem("ucoz-swapper-theme");
  if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function BrandMark() {
  return (
    <a href="#top" className="group inline-flex items-center focus:outline-hidden" aria-label="UcozSwapper — карточка в лендинг за минуту">
      <img
        src={ucozSwapperLogo}
        alt="UcozSwapper"
        className="brand-logo h-12 w-auto transition duration-300 group-hover:-translate-y-0.5 sm:h-14"
      />
    </a>
  );
}

function ProcessStep({ number, icon: Icon, title, description }) {
  return (
    <div className="sunny-step-card">
      <div className="flex items-start gap-3.5">
        <span className="relative grid size-11 shrink-0 place-items-center rounded-2xl bg-white/65 text-violet-700 shadow-sm backdrop-blur-xl">
          <Icon size={19} strokeWidth={2.2} />
          <span className="absolute -end-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-slate-950 text-[9px] font-black text-white">{number}</span>
        </span>
        <div>
          <p className="font-extrabold tracking-[-.02em] text-slate-950">{title}</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
        </div>
      </div>
    </div>
  );
}

function validateProduct(product) {
  const errors = [];
  if (!product) return ["ZenRows не вернул объект карточки."];
  const marketplace = normalizeMarketplace(product.platform);
  if (product.sourceMode !== "zenrows") errors.push("Источник данных не подтверждён ZenRows.");
  if (product.sourceStatus !== "fetched") errors.push(`ZenRows вернул статус «${product.sourceStatus || "unknown"}», а не подтверждённую карточку.`);
  if (!product.title || isFallbackProductTitle(product.title, marketplace)) errors.push("Не найдено название товара.");
  if (!product.description && marketplace !== "avito") errors.push("Не найдено описание товара.");
  if (!product.productId || product.productId === "unknown") errors.push("Не найден ID товара.");
  if (!Array.isArray(product.images) || product.images.length === 0) errors.push("Не найдены фотографии товара.");
  return errors;
}

export default function App() {
  const [productUrl, setProductUrl] = useState("");
  const [marketplaceMode, setMarketplaceMode] = useState("auto");
  const [product, setProduct] = useState(null);
  const [landing, setLanding] = useState(null);
  const [publication, setPublication] = useState(null);
  const [account, setAccount] = useState(loadOrCreateLocalAccount);
  const [landingStatus, setLandingStatus] = useState("idle");
  const [publishMessage, setPublishMessage] = useState("");
  const [status, setStatus] = useState("idle");
  const [previewMode, setPreviewMode] = useState("product");
  const [issues, setIssues] = useState({ errors: [], warnings: [] });
  const [theme, setTheme] = useState(loadInitialTheme);
  const [isUapiOpen, setIsUapiOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("ucoz-swapper-theme", theme);
  }, [theme]);

  async function inspectProduct(event) {
    event.preventDefault();
    setProduct(null);
    setLanding(null);
    setPublication(null);
    setPublishMessage("");
    setLandingStatus("idle");
    setPreviewMode("product");
    setIssues({ errors: [], warnings: [] });
    setStatus("loading");

    try {
      const marketplaceError = validateMarketplaceSelection(productUrl, marketplaceMode);
      if (marketplaceError) throw new Error(marketplaceError);
      const marketplace = resolveMarketplace(productUrl, marketplaceMode);
      if (!marketplace) throw new Error("Не удалось определить маркетплейс по ссылке.");

      const response = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productUrl, marketplace })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "ZenRows не смог обработать карточку.");

      const validationErrors = validateProduct(data.product);
      if (validationErrors.length > 0) {
        setIssues({ errors: validationErrors, warnings: data.product?.warnings || [] });
        setStatus("error");
        return;
      }

      setProduct(data.product);
      setStatus("success");
      await generateLandingFromProduct(data.product);
    } catch (error) {
      setIssues({ errors: [error.message], warnings: [] });
      setStatus("error");
    }
  }

  async function generateLandingFromProduct(currentProduct) {
    if (!currentProduct) return;
    setLandingStatus("loading");
    setPublication(null);
    setPublishMessage("");
    try {
      const generateResponse = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: currentProduct })
      });
      const generated = await generateResponse.json();
      if (!generateResponse.ok) throw new Error(generated.error || "Не удалось сгенерировать лендинг.");
      setLanding(generated);
      setPreviewMode("landing");
      setLandingStatus("success");
    } catch (error) {
      setPublishMessage(error.message);
      setLandingStatus("error");
    }
  }

  async function generateLanding() {
    await generateLandingFromProduct(product);
  }

  async function publishToDemoUcoz() {
    if (!product || !landing?.content) return;
    setLandingStatus("publishing");
    setPublishMessage("");
    try {
      const publishResponse = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product, content: landing.content })
      });
      const published = await publishResponse.json();
      if (!publishResponse.ok) throw new Error(published.error || "Не удалось опубликовать лендинг на uCoz.");
      if (!published.published || !published.url) throw new Error("uCoz не подтвердил публичный URL лендинга.");

      const completedPublication = { ...published, model: landing.model };
      setPublication(completedPublication);
      setAccount((current) => recordSuccessfulPublication(current, completedPublication, product));
      setPublishMessage(published.message || "Лендинг опубликован на demo-uCoz.");
      setLandingStatus("success");
    } catch (error) {
      setPublishMessage(error.message);
      setLandingStatus("error");
    }
  }

  async function publishWithUserUapi({ siteUrl, apiKey }) {
    if (!product || !landing?.content) throw new Error("Сначала сгенерируйте лендинг.");
    const response = await fetch("/api/publish/uapi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product, content: landing.content, siteUrl, apiKey })
    });
    const published = await response.json();
    if (!response.ok) throw new Error(published.error || "uAPI не смог создать страницу.");
    const completedPublication = { ...published, model: landing.model };
    setPublication(completedPublication);
    setAccount((current) => recordSuccessfulPublication(current, completedPublication, product));
    setPublishMessage(published.message || "Страница создана через uAPI.");
    return completedPublication;
  }

  const isBusy = status === "loading";
  const isLandingBusy = landingStatus === "loading" || landingStatus === "publishing";
  const detectedMarketplace = detectMarketplaceFromUrl(productUrl);
  const activeMarketplace = resolveMarketplace(productUrl, marketplaceMode);
  const marketplaceBadge = getMarketplaceMeta(activeMarketplace || (marketplaceMode === "auto" ? detectedMarketplace : marketplaceMode));
  const marketplaceHint = marketplaceMode === "auto"
    ? detectedMarketplace
      ? `Автоопределение: ${getMarketplaceMeta(detectedMarketplace).fullLabel}`
      : "Автоопределение: вставьте ссылку WB или Avito"
    : `Выбрано: ${getMarketplaceMeta(marketplaceMode).fullLabel}`;

  return (
    <main id="top" className={`ucoz-app theme-${theme} relative min-h-screen overflow-hidden pb-48 text-slate-950 sm:pb-40 ${product || isBusy ? "product-active" : ""}`}>
      <div className="sun-grid" aria-hidden="true" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4 py-5 sm:py-7">
          <BrandMark />
          <button type="button" onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")} className="theme-toggle" aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"} title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}>
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            <span>{theme === "dark" ? "Light" : "Dark"}</span>
          </button>
        </header>

        {!product && !isBusy && <section className="mx-auto max-w-5xl pb-9 pt-10 text-center sm:pb-12 sm:pt-16">
          <div className="inline-flex items-center gap-x-2 rounded-full bg-white/60 px-3.5 py-2 text-xs font-bold text-violet-700 shadow-sm backdrop-blur-xl">
            <Sparkles size={14} />
            AI-конструктор для продавцов
          </div>
          <h1 className="font-display mx-auto mt-7 max-w-4xl text-4xl leading-[1.02] tracking-[-.035em] text-slate-950 sm:text-6xl lg:text-7xl">
            Получите персональный лендинг за <span className="sunny-gradient-text">1 минуту</span>
          </h1>
          <p className="font-display mx-auto mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
            Всего два шага: вы даёте нам карточку товара с Wildberries или Avito, а мы возвращаем готовый адаптивный лендинг с сильным CTA.
          </p>

          <div className="mx-auto mt-9 grid max-w-3xl gap-3 text-left sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <ProcessStep number="1" icon={Link2} title="Вы нам карточку" description="Вставьте публичную ссылку на товар WB или Avito." />
            <ArrowRight className="mx-auto hidden text-violet-400 sm:block" size={22} />
            <ProcessStep number="2" icon={WandSparkles} title="Мы вам лендинг" description="AI соберёт страницу и отправит её на uCoz." />
          </div>

          <p className="font-display mx-auto mt-10 max-w-3xl text-sm leading-7 text-slate-500 sm:text-base">
            <strong className="font-extrabold text-slate-900">UcozSwapper</strong> — позволяет за несколько этапов перенести карточку товара с маркетплейса в самостоятельный и полноценный full landing page. Переносите свои карточки товаров просто, быстро и доступно, а остальное мы сделаем за вас!
          </p>
        </section>}

        {isBusy && (
          <section className="product-preview-stage preview-loading grid place-items-center">
            <div className="text-center">
              <span className="mx-auto grid size-12 place-items-center text-violet-600">
                <span className="size-6 animate-spin rounded-full border-[3px] border-violet-200 border-t-violet-600" />
              </span>
              <p className="mt-5 font-extrabold text-slate-900">Собираем карточку</p>
              <p className="mt-1 text-sm text-slate-500">ZenRows получает описание, цену и фотографии…</p>
            </div>
          </section>
        )}

        {product && (
          <section id="product-preview" className="product-preview-stage">
            <div className="product-preview-stack">
              {previewMode === "landing" && landing
                ? <LandingPreview product={product} content={landing.content} warnings={landing.warnings} publication={publication} publishMessage={publishMessage} />
                : <ProductCardPreview product={product} />}
            </div>
          </section>
        )}
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[65] p-3 sm:p-4">
        <section className="bottom-composer pointer-events-auto mx-auto max-w-6xl rounded-[27px] bg-white/72 p-2 shadow-[0_20px_70px_rgba(72,45,118,.19)] backdrop-blur-2xl sm:p-2.5">
          <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
            {[
              { key: "auto", label: "Авто" },
              { key: "wb", label: "WB" },
              { key: "avito", label: "Avito" }
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setMarketplaceMode(option.key)}
                className={`inline-flex min-h-8 items-center rounded-2xl px-3 text-[11px] font-extrabold transition focus:outline-hidden focus:ring-2 focus:ring-violet-100 ${marketplaceMode === option.key ? "bg-slate-950 text-white" : "bg-white/72 text-slate-600 hover:bg-white"}`}
                aria-pressed={marketplaceMode === option.key}
              >
                {option.label}
              </button>
            ))}
            <span className="text-[11px] font-semibold text-slate-500 sm:ms-2">{marketplaceHint}</span>
          </div>
          <form onSubmit={inspectProduct} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="relative min-w-0">
              <label htmlFor="product-url" className="sr-only">Ссылка на карточку товара маркетплейса</label>
              <input
                id="product-url"
                value={productUrl}
                onChange={(event) => setProductUrl(event.target.value)}
                required
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder="Вставьте ссылку Wildberries или Avito…"
                className="block min-h-11 w-full rounded-[19px] bg-white/68 py-2.5 ps-4 pe-14 text-sm font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,.9)] outline-none transition placeholder:text-slate-400 focus:ring-4 focus:ring-violet-100"
              />
              <span className={`marketplace-badge absolute end-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-[15px] bg-gradient-to-br text-[11px] font-black lowercase text-white shadow-[0_8px_22px_rgba(124,58,237,.25)] ${marketplaceBadge.badgeClassName}`} aria-label={marketplaceBadge.fullLabel}>{marketplaceBadge.shortLabel}</span>
            </div>

            <div className="dock-action-group flex flex-wrap items-center gap-1 p-1">
              <button disabled={isBusy} type="submit" className="dock-action dock-action-primary inline-flex min-h-9 items-center justify-center gap-x-1.5 bg-violet-600 px-3.5 text-xs font-extrabold text-white transition hover:bg-violet-700 focus:outline-hidden focus:ring-2 focus:ring-violet-200 disabled:pointer-events-none disabled:opacity-60">
                {isBusy ? <><span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Анализируем…</> : <><Zap size={14} fill="currentColor" /> Создать лендинг</>}
              </button>

              {product && (
                <button type="button" onClick={generateLanding} disabled={isLandingBusy} className="dock-action inline-flex min-h-9 items-center justify-center gap-x-1.5 bg-slate-950 px-3.5 text-xs font-extrabold text-white transition hover:bg-violet-700 focus:outline-hidden focus:ring-2 focus:ring-violet-200 disabled:pointer-events-none disabled:opacity-60">
                  {landingStatus === "loading" ? <><span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Gemini…</> : <><WandSparkles size={14} /> {landing ? "Новый вариант" : "Сгенерировать"}</>}
                </button>
              )}

              {landing && (
                <>
                  <button type="button" onClick={publishToDemoUcoz} disabled={isLandingBusy} className="dock-action inline-flex min-h-9 items-center justify-center gap-x-1.5 bg-violet-600 px-3.5 text-xs font-extrabold text-white transition hover:bg-violet-700 focus:outline-hidden focus:ring-2 focus:ring-violet-200 disabled:pointer-events-none disabled:opacity-60">
                    {landingStatus === "publishing" ? <><Clock3 size={14} /> uCoz…</> : <><Send size={14} /> Demo uCoz</>}
                  </button>
                  <button type="button" onClick={() => setIsUapiOpen(true)} className="dock-action dock-action-uapi inline-flex min-h-9 items-center justify-center gap-x-1.5 px-3.5 text-xs font-extrabold transition focus:outline-hidden focus:ring-2 focus:ring-violet-200">
                    <Send size={14} /> Свой uAPI
                  </button>
                </>
              )}

              <div className="dock-view-toggle flex min-h-9 items-center bg-slate-100/70 p-0.5" role="group" aria-label="Режим предпросмотра">
                <button type="button" onClick={() => setPreviewMode("product")} disabled={!product} className={`dock-toggle inline-flex min-h-8 items-center gap-1.5 px-2.5 text-[11px] font-bold transition ${previewMode === "product" && product ? "is-active" : ""}`} aria-pressed={previewMode === "product"}>
                  <Eye size={13} /> Карточка
                </button>
                <button type="button" onClick={() => setPreviewMode("landing")} disabled={!landing} title={landing ? "Показать лендинг" : "Сначала сгенерируйте лендинг"} className={`dock-toggle inline-flex min-h-8 items-center gap-1.5 px-2.5 text-[11px] font-bold transition ${previewMode === "landing" && landing ? "is-active" : ""}`} aria-pressed={previewMode === "landing"}>
                  <Sparkles size={13} /> Лендинг{!landing && <span className="dock-toggle-placeholder">—</span>}
                </button>
              </div>
            </div>
          </form>

          <div className="mt-2 flex min-h-7 flex-wrap items-center gap-x-4 gap-y-1 px-2 text-[11px] font-semibold text-slate-500">
            <span className="inline-flex items-center gap-1.5"><Check size={12} className="text-emerald-600" /> ZenRows</span>
            <span className="inline-flex items-center gap-1.5"><Sparkles size={12} className="text-violet-600" /> Gemini 3.8 Flash</span>
            <span className="inline-flex items-center gap-1.5"><ShieldCheck size={12} className="text-sky-600" /> Проверка Product DTO</span>
            {landingStatus === "error" && <span className="font-bold text-rose-600">{publishMessage}</span>}
            {publication?.url && <a href={publication.url} target="_blank" rel="noreferrer" className="ms-auto inline-flex items-center gap-1 font-extrabold text-emerald-700">Лендинг опубликован <ExternalLink size={12} /></a>}
          </div>
        </section>
      </div>

      <LocalAccount account={account} />
      {isUapiOpen && <UapiPublishModal onClose={() => setIsUapiOpen(false)} onPublish={publishWithUserUapi} />}
      {status === "error" && <ZenRowsErrorModal errors={issues.errors} warnings={issues.warnings} onClose={() => setStatus("idle")} />}
    </main>
  );
}
