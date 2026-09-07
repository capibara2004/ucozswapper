import { BrainCircuit, FileCheck2, PartyPopper, Radar, ShieldEllipsis } from "lucide-react";
import { useEffect, useState } from "react";

const stages = [
  { icon: BrainCircuit, title: "Собираемся с мыслями…", note: "Готовим маршрут к карточке товара" },
  { icon: ShieldEllipsis, title: "Обходим ограничения чебурнета…", note: "Аккуратно открываем публичную страницу" },
  { icon: Radar, title: "Изучаем данные…", note: "Ищем название, цену, описание и фотографии" },
  { icon: FileCheck2, title: "Получаем сводку…", note: "Проверяем Product DTO и источник данных" },
  { icon: PartyPopper, title: "Возможно, сейчас вы получите карточку :)", note: "Остался последний рывок" }
];

export default function ParsingProgress() {
  const [activeStage, setActiveStage] = useState(0);

  useEffect(() => {
    if (activeStage >= stages.length - 1) return undefined;
    const delay = activeStage === 0 ? 2100 : 2600;
    const timer = window.setTimeout(() => setActiveStage((current) => current + 1), delay);
    return () => window.clearTimeout(timer);
  }, [activeStage]);

  return (
    <div className="parse-progress" role="status" aria-live="polite">
      <div className="parse-progress-track" style={{ "--active-stage": activeStage }}>
        {stages.map(({ icon: Icon, title, note }, index) => (
          <div className={`parse-progress-stage ${index === activeStage ? "is-active" : ""}`} key={title} aria-hidden={index !== activeStage}>
            <span className="parse-progress-icon"><Icon size={25} strokeWidth={1.9} /></span>
            <div>
              <p>{title}</p>
              <span>{note}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="parse-progress-dots" aria-hidden="true">
        {stages.map((stage, index) => <i className={index <= activeStage ? "is-active" : ""} key={stage.title} />)}
      </div>
    </div>
  );
}
