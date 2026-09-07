import { ExternalLink, RefreshCw, Sparkles, X } from "lucide-react";
import { useEffect } from "react";

export default function LandingHtmlPreviewModal({ html, product, generationMode, isRegenerating, onClose, onRegenerate }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !isRegenerating) onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isRegenerating, onClose]);

  return (
    <div className="landing-html-modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !isRegenerating && onClose()}>
      <section className="landing-html-modal" role="dialog" aria-modal="true" aria-labelledby="landing-html-preview-title">
        <div className="landing-html-frame-shell">
          {html
            ? <iframe key={`${product?.productId}-${html.length}`} title="Предпросмотр готового лендинга" srcDoc={html} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" />
            : <p className="landing-html-empty">HTML лендинга пока не сформирован.</p>}
        </div>
        <footer className="landing-html-modal-controls">
          <div className="landing-html-modal-meta">
            <p><Sparkles size={13} /> {generationMode === "ai-html" ? "AI HTML · experimental" : "Финальный HTML"}</p>
            <h2 id="landing-html-preview-title">Предпросмотр лендинга</h2>
          </div>
          <div className="landing-html-modal-actions">
            <a href={product?.productUrl} target="_blank" rel="noreferrer" title="Открыть исходную карточку">
              Источник <ExternalLink size={14} />
            </a>
            <button type="button" onClick={onRegenerate} disabled={isRegenerating}>
              <RefreshCw size={14} className={isRegenerating ? "is-spinning" : ""} />
              {isRegenerating ? "Генерируем…" : "Новый вариант"}
            </button>
            <button type="button" className="landing-html-modal-close" onClick={onClose} disabled={isRegenerating} aria-label="Закрыть предпросмотр">
              Закрыть <X size={16} />
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
