import { useState } from "react";
import { ExternalLink, History, Moon, Sun, X } from "lucide-react";
import { getMarketplaceLinkLabel, upgradeDisplayImageUrl } from "../lib/marketplace";

function compactId(value) {
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

export default function LocalAccount({ account, theme, onToggleTheme }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div className="utility-toggle-group" role="group" aria-label="Настройки и история">
        <button
          type="button"
          onClick={onToggleTheme}
          className="theme-toggle utility-toggle-button"
          aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
          title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button
          type="button"
          className="history-fab utility-toggle-button group"
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-controls="history-drawer"
          aria-label="Открыть историю лендингов"
          title="История лендингов"
          onClick={() => setIsOpen(true)}
        >
          <History size={17} strokeWidth={2.1} className="transition group-hover:scale-105 group-hover:text-violet-700" />
          <span className="history-count-badge">
            {account.publications.length}
          </span>
        </button>
      </div>

      {isOpen && <aside
        id="history-drawer"
        className="history-drawer fixed inset-y-0 end-0 z-[90] h-full w-full max-w-md bg-white/90 shadow-[-24px_0_80px_rgba(70,45,120,.16)] backdrop-blur-2xl"
        role="dialog"
        tabIndex="-1"
        aria-labelledby="history-drawer-title"
      >
        <div className="flex h-full flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-violet-100/80 px-5 py-5 sm:px-6">
            <div>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[.14em] text-violet-600"><History size={14} /> Local history</span>
              <h2 id="history-drawer-title" className="mt-2 text-2xl font-black tracking-[-.04em] text-slate-950">Ваши лендинги</h2>
              <p className="mt-1 text-xs font-medium text-slate-500">ID: {compactId(account.userId)}</p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="inline-flex size-10 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/70 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-hidden focus:ring-4 focus:ring-violet-100"
              aria-label="Закрыть историю"
            >
              <X size={18} />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            {account.publications.length === 0 ? (
              <div className="grid min-h-64 place-items-center rounded-[26px] border border-dashed border-violet-200 bg-violet-50/35 p-7 text-center">
                <div>
                  <span className="mx-auto grid size-14 place-items-center rounded-[20px] bg-white text-violet-600 shadow-sm"><History size={23} /></span>
                  <p className="mt-4 font-extrabold text-slate-900">История пока пустая</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">Здесь появятся карточки всех успешно опубликованных лендингов.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {account.publications.map((item) => (
                  <article key={item.operationId} className="group grid grid-cols-[72px_minmax(0,1fr)] gap-3 rounded-[22px] border border-white/90 bg-white/68 p-3 shadow-[0_10px_30px_rgba(79,70,229,.06)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-[0_14px_38px_rgba(79,70,229,.10)]">
                    <div className="size-[72px] overflow-hidden rounded-[17px] bg-violet-50">
                      {item.previewImage ? <img src={upgradeDisplayImageUrl(item.previewImage, item)} alt="" className="size-full object-cover" /> : <span className="grid size-full place-items-center font-black text-violet-600">US</span>}
                    </div>
                    <div className="min-w-0 py-0.5">
                      <p className="line-clamp-2 text-sm font-extrabold leading-5 text-slate-900">{item.title}</p>
                      <p className="mt-1 font-mono text-[10px] text-slate-400">#{item.operationId}</p>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        <a href={item.productUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 transition hover:text-violet-700">{getMarketplaceLinkLabel(item)} <ExternalLink size={12} /></a>
                        <a href={item.publishedUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-extrabold text-violet-700 transition hover:text-violet-900">Лендинг <ExternalLink size={12} /></a>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-violet-100/80 px-5 py-4 text-xs leading-5 text-slate-500">
            История хранится только в этом браузере до очистки localStorage.
          </div>
        </div>
      </aside>}
    </>
  );
}
