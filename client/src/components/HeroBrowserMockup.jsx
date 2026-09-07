import { useEffect, useState } from "react";

const examples = [
  {
    src: `${import.meta.env.BASE_URL}assets/landing-example-1.png`,
    alt: "Пример AI-лендинга для спортивной одежды",
    accent: "violet"
  },
  {
    src: `${import.meta.env.BASE_URL}assets/landing-example-2.png`,
    alt: "Пример AI-лендинга для товара питания",
    accent: "orange"
  },
  {
    src: `${import.meta.env.BASE_URL}assets/landing-example-3.png`,
    alt: "Пример AI-лендинга для объявления Avito с видеокартой",
    accent: "emerald"
  },
  {
    src: `${import.meta.env.BASE_URL}assets/landing-example-4.png`,
    alt: "Пример AI-лендинга для игрового компьютера с Avito",
    accent: "graphite"
  }
];

export default function HeroBrowserMockup() {
  const [activeSlide, setActiveSlide] = useState(0);
  const activeExample = examples[activeSlide];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % examples.length);
    }, 5200);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className={`hero-browser-stack hero-browser-example-${activeExample.accent}`}>
      <div className="hero-browser" aria-label="Примеры готовых лендингов UcozSwapper">
        <div className="hero-browser-bar">
          <span className="hero-browser-dots" aria-hidden="true"><i /><i /><i /></span>
          <span className="hero-browser-address">ucozswapper.app / landing-preview</span>
          <span className="hero-browser-live"><i /> Live preview</span>
        </div>
        <div className="hero-browser-viewport">
          {examples.map((example, index) => (
            <img
              className={`hero-browser-example ${index === activeSlide ? "is-active" : ""}`}
              src={example.src}
              alt={example.alt}
              aria-hidden={index !== activeSlide}
              key={example.src}
            />
          ))}
          <div className="hero-browser-pagination" aria-hidden="true">
            {examples.map((example, index) => <i className={index === activeSlide ? "is-active" : ""} key={example.src} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
