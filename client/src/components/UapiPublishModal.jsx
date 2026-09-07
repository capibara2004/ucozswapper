import { ExternalLink, KeyRound, Send, ShieldCheck, X } from "lucide-react";
import { useState } from "react";

function normalizeSiteUrl(value) {
  const text = String(value || "").trim();
  if (!text || /^https?:\/\//i.test(text)) return text;
  return `https://${text}`;
}

export default function UapiPublishModal({ onClose, onPublish }) {
  const [siteUrl, setSiteUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  async function submit(event) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      const normalizedSiteUrl = normalizeSiteUrl(siteUrl);
      const parsedUrl = new URL(normalizedSiteUrl);
      if (!/^https?:$/.test(parsedUrl.protocol) || !parsedUrl.hostname) throw new Error("Введите корректный адрес сайта uCoz.");
      setSiteUrl(normalizedSiteUrl);
      await onPublish({ siteUrl: normalizedSiteUrl, apiKey });
      setApiKey("");
      setStatus("success");
      setMessage("Страница создана. Её можно открыть и редактировать в панели uCoz.");
    } catch (error) {
      setStatus("error");
      setMessage(error.message);
    }
  }

  return (
    <div className="uapi-modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="uapi-modal" role="dialog" aria-modal="true" aria-labelledby="uapi-modal-title">
        <header className="uapi-modal-header">
          <div>
            <span className="uapi-modal-kicker"><KeyRound size={14} /> Прямая публикация</span>
            <h2 id="uapi-modal-title">Отправить по uAPI</h2>
          </div>
          <button type="button" onClick={onClose} className="uapi-modal-close" aria-label="Закрыть"><X size={18} /></button>
        </header>

        <form onSubmit={submit} className="uapi-modal-form">
          <label>
            <span>Адрес сайта uCoz</span>
            <input type="text" inputMode="url" required value={siteUrl} onChange={(event) => setSiteUrl(event.target.value)} onBlur={() => setSiteUrl((current) => normalizeSiteUrl(current))} placeholder="example.ucoz.net" autoComplete="url" />
          </label>
          <label>
            <span>uAPI key</span>
            <input type="password" required value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk_live_…" autoComplete="off" spellCheck="false" />
          </label>

          <div className="uapi-security-note">
            <ShieldCheck size={17} />
            <p>Ключ используется только в этом запросе и нигде не сохраняется. На production отправка разрешена только через HTTPS.</p>
          </div>

          {message && <p className={`uapi-modal-message is-${status}`}>{message}</p>}

          <div className="uapi-modal-actions">
            <a href="https://www.ucoz.ru/help/extensions/uapi" target="_blank" rel="noreferrer">Как получить ключ <ExternalLink size={13} /></a>
            <button type="submit" disabled={status === "loading"}>
              {status === "loading" ? <><span className="uapi-spinner" /> Отправляем…</> : <><Send size={15} /> Создать страницу</>}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
