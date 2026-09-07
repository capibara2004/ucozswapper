import { useEffect, useRef, useState } from "react";
import {
  Check,
  Code2,
  Eye,
  ExternalLink,
  LayoutTemplate,
  Send,
  ShieldCheck,
  Sparkles,
  Zap
} from "lucide-react";
import ProductCardPreview from "./components/ProductCardPreview";
import HeroBrowserMockup from "./components/HeroBrowserMockup";
import LandingHtmlPreviewModal from "./components/LandingHtmlPreviewModal";
import LocalAccount from "./components/LocalAccount";
import MarketplaceIcon from "./components/MarketplaceIcon";
import ParsingProgress from "./components/ParsingProgress";
import UapiPublishModal from "./components/UapiPublishModal";
import ZenRowsErrorModal from "./components/ZenRowsErrorModal";
import { loadOrCreateLocalAccount, recordSuccessfulPublication } from "./lib/localAccount";
import {
  detectMarketplaceFromUrl,
  getMarketplaceMeta,
  isFallbackProductTitle,
  normalizeMarketplace,
  resolveMarketplace,
  validateProductMarketplace,
  validateMarketplaceSelection
} from "./lib/marketplace";
import ucozSwapperLogo from "./assets/logo2.svg";

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

function TypewriterHeadline() {
  const prefix = "Получите лендинг за ";
  const accent = "1 минуту";
  const fullText = `${prefix}${accent}`;
  const [visibleCharacters, setVisibleCharacters] = useState(0);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setVisibleCharacters(fullText.length);
      return undefined;
    }
    let interval;
    const delay = window.setTimeout(() => {
      interval = window.setInterval(() => {
        setVisibleCharacters((current) => {
          if (current >= fullText.length) {
            window.clearInterval(interval);
            return current;
          }
          return current + 1;
        });
      }, 54);
    }, 650);
    return () => {
      window.clearTimeout(delay);
      window.clearInterval(interval);
    };
  }, [fullText.length]);

  return (
    <h1 className="hero-typing-title" aria-label={fullText}>
      <span aria-hidden="true">{prefix.slice(0, visibleCharacters)}</span>
      <span aria-hidden="true" className="sunny-gradient-text">{accent.slice(0, Math.max(0, visibleCharacters - prefix.length))}</span>
      <i className={visibleCharacters >= fullText.length ? "is-complete" : ""} aria-hidden="true" />
    </h1>
  );
}

function validateProduct(product) {
  const errors = [];
  if (!product) return ["Сервис парсинга не вернул объект карточки."];
  const marketplace = normalizeMarketplace(product.platform);
  const supportedSources = new Set(["zenrows", "scrapfly"]);
  const sourceName = product.sourceMode === "scrapfly" ? "Scrapfly" : product.sourceMode === "zenrows" ? "ZenRows" : "Сервис парсинга";
  if (!supportedSources.has(product.sourceMode)) errors.push("Источник данных карточки не подтверждён.");
  if (product.sourceStatus !== "fetched") errors.push(`${sourceName} вернул статус «${product.sourceStatus || "unknown"}», а не подтверждённую карточку.`);
  if (!product.title || isFallbackProductTitle(product.title, marketplace)) errors.push("Не найдено название товара.");
  if (!product.description && marketplace !== "avito") errors.push("Не найдено описание товара.");
  if (!product.productId || product.productId === "unknown") errors.push("Не найден ID товара.");
  if (!Array.isArray(product.images) || product.images.length === 0) errors.push("Не найдены фотографии товара.");
  return errors;
}

function UcozSupportMark() {
  return (
    <a className="ucoz-support-logo" href="https://ucoz.ru" target="_blank" rel="noreferrer" aria-label="Создано при поддержке команды uCoz">
      <img src={`${import.meta.env.BASE_URL}assets/logo.png`} alt="uCoz" />
      <span>Создано при поддержке<br /><strong>команды uCoz</strong></span>
    </a>
  );
}

function apiUrl(pathname) {
  const mountPath = window.location.pathname.replace(/\/+$/, "");
  return `${mountPath}${pathname}`;
}

async function readApiJson(response, actionLabel) {
  const rawBody = await response.text();
  if (!rawBody.trim()) {
    throw new Error(`${actionLabel}: сервер закрыл соединение без ответа (HTTP ${response.status}).`);
  }
  try {
    return JSON.parse(rawBody);
  } catch {
    throw new Error(`${actionLabel}: сервер вернул оборванный или некорректный JSON (HTTP ${response.status}).`);
  }
}

export default function App() {
  const defaultModel = "gemini-3.8-flash";
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
  const [isLandingPreviewOpen, setIsLandingPreviewOpen] = useState(false);
  const [modelOptions, setModelOptions] = useState([defaultModel]);
  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const [customModel, setCustomModel] = useState("");
  const [modelWarning, setModelWarning] = useState("");
  const [generationMode, setGenerationMode] = useState("template");
  const parseRequestRef = useRef(null);
  const generationRequestRef = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("ucoz-swapper-theme", theme);
  }, [theme]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(apiUrl("/api/models"), { signal: controller.signal })
      .then(async (response) => {
        const payload = await readApiJson(response, "Получение списка моделей");
        if (!response.ok) throw new Error(payload.error || "Не удалось получить список моделей.");
        const models = Array.isArray(payload.models) && payload.models.length ? payload.models : [defaultModel];
        setModelOptions([...new Set([payload.defaultModel || defaultModel, ...models])]);
        setSelectedModel((current) => current || payload.defaultModel || defaultModel);
        setModelWarning(payload.warning || "");
      })
      .catch((error) => {
        if (error.name !== "AbortError") setModelWarning(error.message);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => () => {
    parseRequestRef.current?.abort();
    generationRequestRef.current?.abort();
  }, []);

  async function inspectProduct(event) {
    event.preventDefault();
    if (status === "loading" || landingStatus === "loading") return;
    const controller = new AbortController();
    parseRequestRef.current?.abort();
    parseRequestRef.current = controller;
    setProduct(null);
    setLanding(null);
    setPublication(null);
    setPublishMessage("");
    setLandingStatus("idle");
    setPreviewMode("product");
    setIsLandingPreviewOpen(false);
    setIssues({ errors: [], warnings: [] });
    setStatus("loading");

    try {
      const marketplaceError = validateMarketplaceSelection(productUrl, marketplaceMode);
      if (marketplaceError) throw new Error(marketplaceError);
      const marketplace = resolveMarketplace(productUrl, marketplaceMode);
      if (!marketplace) throw new Error("Не удалось определить маркетплейс по ссылке.");

      const response = await fetch(apiUrl("/api/parse"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productUrl, marketplace }),
        signal: controller.signal
      });
      const data = await readApiJson(response, "Получение карточки");
      if (!response.ok) throw new Error(data.error || "Сервис парсинга не смог обработать карточку.");

      const validationErrors = validateProduct(data.product);
      const marketplaceContextError = validateProductMarketplace(data.product, productUrl, marketplaceMode);
      if (marketplaceContextError) validationErrors.push(marketplaceContextError);
      if (validationErrors.length > 0) {
        setIssues({ errors: validationErrors, warnings: data.product?.warnings || [] });
        setStatus("error");
        return;
      }

      setProduct(data.product);
      setStatus("success");
    } catch (error) {
      if (error.name === "AbortError") return;
      setIssues({ errors: [error.message], warnings: [] });
      setStatus("error");
    } finally {
      if (parseRequestRef.current === controller) parseRequestRef.current = null;
    }
  }

  async function generateLandingFromProduct(currentProduct) {
    if (!currentProduct || landingStatus === "loading") return;
    const marketplaceContextError = validateProductMarketplace(currentProduct, productUrl, marketplaceMode);
    if (marketplaceContextError) {
      setIssues({ errors: [marketplaceContextError], warnings: [] });
      setStatus("error");
      return;
    }
    setLandingStatus("loading");
    setPublication(null);
    setPublishMessage("");
    const controller = new AbortController();
    generationRequestRef.current?.abort();
    generationRequestRef.current = controller;
    try {
      const model = selectedModel === "__custom__" ? customModel.trim() : selectedModel;
      if (!model) throw new Error("Укажите имя пользовательской модели Nexus.");
      const generateResponse = await fetch(apiUrl("/api/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: currentProduct, model, generationMode }),
        signal: controller.signal
      });
      const generated = await readApiJson(generateResponse, "Генерация лендинга");
      if (!generateResponse.ok) throw new Error(generated.error || "Не удалось сгенерировать лендинг.");
      const generatedMarketplaceError = validateProductMarketplace(generated.product, currentProduct.productUrl, marketplaceMode);
      if (generatedMarketplaceError || generated.product?.productId !== currentProduct.productId) {
        throw new Error(generatedMarketplaceError || "AI вернул лендинг для другой карточки товара.");
      }
      if (!generated.html) throw new Error("Сервер не вернул финальный HTML лендинга.");
      setLanding(generated);
      setPreviewMode("landing");
      setIsLandingPreviewOpen(true);
      setLandingStatus("success");
    } catch (error) {
      if (error.name === "AbortError") return;
      setPublishMessage(error.message);
      setLandingStatus("error");
    } finally {
      if (generationRequestRef.current === controller) generationRequestRef.current = null;
    }
  }

  async function generateLanding() {
    await generateLandingFromProduct(product);
  }

  async function publishWithUserUapi({ siteUrl, apiKey }) {
    if (!product || !landing?.content) throw new Error("Сначала сгенерируйте лендинг.");
    const marketplaceContextError = validateProductMarketplace(product, productUrl, marketplaceMode);
    if (marketplaceContextError) throw new Error(marketplaceContextError);
    if (landing.product?.productId !== product.productId) throw new Error("Лендинг не соответствует текущей карточке товара.");
    const response = await fetch(apiUrl("/api/publish/uapi"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product,
        content: landing.content,
        html: landing.html,
        generationMode: landing.generationMode || "template",
        siteUrl,
        apiKey
      })
    });
    const published = await readApiJson(response, "Публикация через uAPI");
    if (!response.ok) throw new Error(published.error || "uAPI не смог создать страницу.");
    const completedPublication = { ...published, model: landing.model };
    setPublication(completedPublication);
    setAccount((current) => recordSuccessfulPublication(current, completedPublication, product));
    setPublishMessage(published.message || "Страница создана через uAPI.");
    return completedPublication;
  }

  function resetGeneratedProduct() {
    setProduct(null);
    setLanding(null);
    setPublication(null);
    setLandingStatus("idle");
    setPreviewMode("product");
    setIsLandingPreviewOpen(false);
    setPublishMessage("");
    setStatus("idle");
  }

  function changeMarketplaceMode(nextMode) {
    if (status === "loading" || landingStatus === "loading") return;
    const currentProductMarketplace = normalizeMarketplace(product?.platform || product?.marketplace);
    const nextMarketplace = normalizeMarketplace(nextMode);
    setMarketplaceMode(nextMode);
    if (product && nextMarketplace && currentProductMarketplace !== nextMarketplace) {
      resetGeneratedProduct();
    }
  }

  function changeProductUrl(nextUrl) {
    if (status === "loading" || landingStatus === "loading") return;
    if (product && nextUrl.trim() !== String(product.productUrl || "").trim()) {
      resetGeneratedProduct();
    }
    setProductUrl(nextUrl);
  }

  function changeGenerationMode(nextMode) {
    if (status === "loading" || landingStatus === "loading") return;
    if (nextMode === generationMode) return;
    setGenerationMode(nextMode);
    setLanding(null);
    setPublication(null);
    setLandingStatus("idle");
    setPreviewMode("product");
    setIsLandingPreviewOpen(false);
    setPublishMessage("");
  }

  function openLandingPreview() {
    const marketplaceContextError = validateProductMarketplace(product, productUrl, marketplaceMode);
    if (marketplaceContextError) {
      setIssues({ errors: [marketplaceContextError], warnings: [] });
      setStatus("error");
      return;
    }
    if (!landing?.html || landing.product?.productId !== product?.productId) {
      generateLandingFromProduct(product);
      return;
    }
    setPreviewMode("landing");
    setIsLandingPreviewOpen(true);
  }

  function closeLandingPreview() {
    setIsLandingPreviewOpen(false);
    setPreviewMode("product");
  }

  const isBusy = status === "loading";
  const isLandingBusy = landingStatus === "loading";
  const isWorkflowBusy = isBusy || isLandingBusy;
  const detectedMarketplace = detectMarketplaceFromUrl(productUrl);
  const activeMarketplace = resolveMarketplace(productUrl, marketplaceMode);
  const marketplaceBadge = getMarketplaceMeta(activeMarketplace || (marketplaceMode === "auto" ? detectedMarketplace : marketplaceMode));
  const marketplaceHint = marketplaceMode === "auto"
    ? detectedMarketplace
      ? `Автоопределение: ${getMarketplaceMeta(detectedMarketplace).fullLabel}`
      : "Автоопределение: вставьте ссылку WB или Avito"
    : `Выбрано: ${getMarketplaceMeta(marketplaceMode).fullLabel}`;
  const marketplaceSelectionError = validateMarketplaceSelection(productUrl, marketplaceMode);

  return (
    <main id="top" className={`ucoz-app theme-${theme} relative min-h-screen overflow-hidden text-slate-950 ${product || isBusy ? "product-active pb-48 sm:pb-40" : "home-active"}`}>
      <div className="sun-grid" aria-hidden="true" />

      <div className="app-shell relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4 py-5 sm:py-7">
          <div className="brand-cluster">
            <BrandMark />
            <UcozSupportMark />
          </div>
        </header>

        {!product && !isBusy && <section className="home-hero mx-auto max-w-6xl pb-4 pt-2 text-center sm:pt-3">
          <TypewriterHeadline />
          <p className="mx-auto mt-2 max-w-2xl text-xs font-light leading-5 text-slate-600 sm:text-sm">
            Карточка маркетплейса превращается в готовый адаптивный лендинг с сильным CTA.
          </p>
          <div className="hero-benefits" aria-label="Преимущества">
            <span><Check size={12} /> WB и Avito</span>
            <span><Check size={12} /> Публикация на uCoz</span>
            <span><Check size={12} /> OpenSource</span>
            <span><Check size={12} /> Более 30 бесплатных шаблонов</span>
          </div>
          <HeroBrowserMockup />
        </section>}

        {isBusy && (
          <section className="product-preview-stage preview-loading grid place-items-center">
            <ParsingProgress />
          </section>
        )}

        {product && (
          <section id="product-preview" className="product-preview-stage">
            <div className="product-preview-stack">
              <ProductCardPreview product={product} />
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
                disabled={isWorkflowBusy}
                onClick={() => changeMarketplaceMode(option.key)}
                className={`marketplace-toggle-button inline-flex min-h-8 items-center gap-1.5 px-3 text-[11px] font-extrabold transition focus:outline-hidden focus:ring-2 focus:ring-violet-100 ${marketplaceMode === option.key ? "is-active" : ""}`}
                aria-pressed={marketplaceMode === option.key}
              >
                <MarketplaceIcon marketplace={option.key === "auto" ? null : option.key} className="marketplace-toggle-icon" />
                {option.label}
              </button>
            ))}
            <span className={`text-[11px] font-semibold sm:ms-2 ${marketplaceSelectionError ? "text-rose-600" : "text-slate-500"}`}>{marketplaceSelectionError || marketplaceHint}</span>
            <div className="generation-mode-toggle" role="group" aria-label="Способ генерации HTML">
              <button type="button" disabled={isWorkflowBusy} onClick={() => changeGenerationMode("template")} className={generationMode === "template" ? "is-active" : ""} aria-pressed={generationMode === "template"} title="Проверенный серверный шаблонизатор">
                <LayoutTemplate size={13} /> Готовый шаблон
              </button>
              <button type="button" disabled={isWorkflowBusy} onClick={() => changeGenerationMode("ai-html")} className={generationMode === "ai-html" ? "is-active" : ""} aria-pressed={generationMode === "ai-html"} title="Эксперимент: полный HTML генерирует выбранная модель">
                <Code2 size={13} /> AI-шаблон
              </button>
            </div>
            <label className="model-picker sm:ms-auto" title={modelWarning || "Модель Nexus для генерации лендинга"}>
              <Sparkles size={13} />
              <span className="sr-only">Модель Nexus</span>
              <select disabled={isWorkflowBusy} value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)}>
                {modelOptions.map((model) => <option key={model} value={model}>{model === defaultModel ? "Gemini 3.8 Flash" : model}</option>)}
                <option value="__custom__">Другая модель…</option>
              </select>
            </label>
            {selectedModel === "__custom__" && (
              <input
                className="model-custom-input"
                disabled={isWorkflowBusy}
                value={customModel}
                onChange={(event) => setCustomModel(event.target.value)}
                placeholder="provider/model-name"
                aria-label="Имя пользовательской модели Nexus"
              />
            )}
          </div>
          <form onSubmit={inspectProduct} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="relative min-w-0">
              <label htmlFor="product-url" className="sr-only">Ссылка на карточку товара маркетплейса</label>
              <input
                id="product-url"
                disabled={isWorkflowBusy}
                value={productUrl}
                onChange={(event) => changeProductUrl(event.target.value)}
                required
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder="Вставьте ссылку Wildberries или Avito…"
                className="block min-h-11 w-full rounded-[19px] bg-white/68 py-2.5 ps-4 pe-14 text-sm font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,.9)] outline-none transition placeholder:text-slate-400 focus:ring-4 focus:ring-violet-100"
              />
              <span className={`marketplace-badge marketplace-badge-${marketplaceBadge.key} absolute end-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center shadow-[0_8px_22px_rgba(124,58,237,.25)]`} aria-label={marketplaceBadge.fullLabel}>
                <MarketplaceIcon marketplace={marketplaceBadge.key} className="marketplace-badge-icon" />
              </span>
            </div>

            <div className="dock-action-group flex flex-wrap items-center gap-1 p-1">
              <button disabled={isWorkflowBusy} type="submit" className="dock-action dock-action-primary inline-flex min-h-9 items-center justify-center gap-x-1.5 bg-violet-600 px-3.5 text-xs font-extrabold text-white transition hover:bg-violet-700 focus:outline-hidden focus:ring-2 focus:ring-violet-200 disabled:pointer-events-none disabled:opacity-60">
                {isBusy ? <><span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Анализируем…</> : isLandingBusy ? <><span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Генерируем…</> : <><Zap size={14} fill="currentColor" /> Создать лендинг</>}
              </button>

              {landing && (
                <button type="button" onClick={() => setIsUapiOpen(true)} className="dock-action dock-action-uapi inline-flex min-h-9 items-center justify-center gap-x-1.5 px-3.5 text-xs font-extrabold transition focus:outline-hidden focus:ring-2 focus:ring-violet-200">
                  <Send size={14} /> Отправить по uAPI
                </button>
              )}

              <div className="dock-view-toggle flex min-h-9 items-center bg-slate-100/70 p-0.5" role="group" aria-label="Режим предпросмотра">
                <button type="button" onClick={closeLandingPreview} disabled={!product} className={`dock-toggle inline-flex min-h-8 items-center gap-1.5 px-2.5 text-[11px] font-bold transition ${previewMode === "product" && product ? "is-active" : ""}`} aria-pressed={previewMode === "product"}>
                  <Eye size={13} /> Карточка
                </button>
                <button type="button" onClick={openLandingPreview} disabled={!product || isLandingBusy} title={landing ? "Показать финальный HTML" : "Сгенерировать и показать лендинг"} className={`dock-toggle inline-flex min-h-8 items-center gap-1.5 px-2.5 text-[11px] font-bold transition ${previewMode === "landing" ? "is-active" : ""}`} aria-pressed={previewMode === "landing"}>
                  {isLandingBusy ? <span className="size-3 animate-spin rounded-full border-2 border-current/25 border-t-current" /> : <Sparkles size={13} />} Лендинг{!landing && !isLandingBusy && <span className="dock-toggle-placeholder">+</span>}
                </button>
              </div>
            </div>
          </form>

          <div className="mt-2 flex min-h-7 flex-wrap items-center gap-x-4 gap-y-1 px-2 text-[11px] font-semibold text-slate-500">
            <span className="inline-flex items-center gap-1.5"><Check size={12} className="text-emerald-600" /> {activeMarketplace === "avito" ? "Scrapfly" : "ZenRows"}</span>
            <span className="inline-flex items-center gap-1.5"><Sparkles size={12} className="text-violet-600" /> {selectedModel === "__custom__" ? customModel || "Другая модель" : selectedModel === defaultModel ? "Gemini 3.8 Flash" : selectedModel}</span>
            <span className="inline-flex items-center gap-1.5"><ShieldCheck size={12} className="text-sky-600" /> Zod: Product DTO + LandingContent</span>
            <span className="inline-flex items-center gap-1.5"><Code2 size={12} className="text-fuchsia-600" /> {generationMode === "ai-html" ? "AI HTML · test" : "Шаблонизатор"}</span>
            {landingStatus === "error" && <span className="font-bold text-rose-600">{publishMessage}</span>}
            {publication?.url && <a href={publication.url} target="_blank" rel="noreferrer" className="ms-auto inline-flex items-center gap-1 font-extrabold text-emerald-700">Лендинг опубликован <ExternalLink size={12} /></a>}
          </div>
        </section>
      </div>

      <LocalAccount
        account={account}
        theme={theme}
        onToggleTheme={() => setTheme((current) => current === "dark" ? "light" : "dark")}
      />
      {isUapiOpen && <UapiPublishModal onClose={() => setIsUapiOpen(false)} onPublish={publishWithUserUapi} />}
      {isLandingPreviewOpen && landing?.html && (
        <LandingHtmlPreviewModal
          html={landing.html}
          product={product}
          generationMode={landing.generationMode || "template"}
          isRegenerating={isLandingBusy}
          onClose={closeLandingPreview}
          onRegenerate={generateLanding}
        />
      )}
      {status === "error" && <ZenRowsErrorModal provider={activeMarketplace === "avito" ? "Scrapfly" : "ZenRows"} errors={issues.errors} warnings={issues.warnings} onClose={() => setStatus("idle")} />}
    </main>
  );
}
