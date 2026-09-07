import "./zenrows.css";

export default function ZenRowsErrorModal({ provider = "Parsing", errors = [], warnings = [], onClose }) {
  if (!errors.length && !warnings.length) return null;

  return (
    <div className="zenrows-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="zenrows-modal" role="dialog" aria-modal="true" aria-labelledby="zenrows-modal-title">
        <button className="zenrows-modal-close" type="button" onClick={onClose} aria-label="Закрыть">×</button>
        <div className="zenrows-modal-icon">!</div>
        <span className="zenrows-eyebrow">{provider} handler</span>
        <h2 id="zenrows-modal-title">Карточку не удалось подтвердить</h2>
        <p className="zenrows-modal-lead">Мы получили ответ, но не пропустили его в preview: обязательные поля должны пройти проверку.</p>

        {errors.length > 0 && (
          <div className="zenrows-issues">
            <h3>Ошибки</h3>
            {errors.map((error) => <p key={error}><b>×</b>{error}</p>)}
          </div>
        )}

        {warnings.length > 0 && (
          <div className="zenrows-warnings">
            <h3>Предупреждения</h3>
            {warnings.map((warning) => <p key={warning}>⚠ {warning}</p>)}
          </div>
        )}

        <button className="zenrows-modal-action" type="button" onClick={onClose}>Понятно</button>
      </section>
    </div>
  );
}
