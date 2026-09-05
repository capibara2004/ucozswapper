import { useEffect, useState } from "react";
import "./zenrows.css";
import { getPriceLabel, thumbnailDisplayUrl, upgradeDisplayImageUrl } from "../lib/marketplace";

export default function ProductCardPreview({ product }) {
  const images = (product.images || []).map((image) => upgradeDisplayImageUrl(image, product));
  const characteristics = product.characteristics || [];
  const [activeIndex, setActiveIndex] = useState(0);
  const activeImage = images[activeIndex] || images[0];

  useEffect(() => {
    setActiveIndex(0);
  }, [product.productId]);

  return (
    <article className="zenrows-card zenrows-card-enter">
      <div className="zenrows-card-topline">
        <div>
          <span className="zenrows-eyebrow">Product preview</span>
          <h2 className="zenrows-card-title">Карточка готова к переносу</h2>
        </div>
        <span className="zenrows-success-badge"><i /> Данные подтверждены</span>
      </div>

      <div className="zenrows-card-grid">
        <div className="zenrows-gallery">
          <div className="zenrows-main-image">
            {activeImage ? <img src={activeImage} alt={product.title} decoding="async" draggable="false" /> : <span>Нет изображения</span>}
            {images.length > 0 && <span className="zenrows-image-counter">{activeIndex + 1} / {images.length}</span>}
          </div>
          {images.length > 1 && (
            <div className="zenrows-thumbnails" aria-label="Фотографии товара">
              {images.map((image, index) => (
                <button type="button" className={`zenrows-thumbnail-button ${index === activeIndex ? "is-active" : ""}`} key={image} onClick={() => setActiveIndex(index)} aria-label={`Показать фото ${index + 1}`} aria-pressed={index === activeIndex}>
                  <img src={thumbnailDisplayUrl(image, product)} alt={`${product.title} — фото ${index + 1}`} loading="lazy" decoding="async" draggable="false" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="zenrows-product-data">
          <dl className="zenrows-data-grid">
            <div className="zenrows-data-item">
              <dt>Название</dt>
              <dd className="zenrows-title-value">{product.title || "Не найдено"}</dd>
            </div>
            <div className="zenrows-data-item">
              <dt>{getPriceLabel(product)}</dt>
              <dd className="zenrows-price-value">{product.priceWithoutWallet || product.price || "Не найдено"}</dd>
            </div>
            <div className="zenrows-data-item">
              <dt>ID товара</dt>
              <dd>{product.productId || "Не найдено"}</dd>
            </div>
            <div className="zenrows-data-item zenrows-description-item">
              <dt>Описание</dt>
              <dd><p className="zenrows-description">{product.description || "Не найдено"}</p></dd>
            </div>
          </dl>
          {characteristics.length > 0 && (
            <>
              <h3 className="zenrows-data-heading">Характеристики</h3>
              <dl className="zenrows-data-grid">
                {characteristics.slice(0, 12).map(({ label, value }) => (
                  <div className="zenrows-data-item" key={`${label}-${value}`}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </div>
      </div>

      <div className="zenrows-card-footer">
        <span>Источник: {product.sourceMode === "zenrows" ? "ZenRows" : product.sourceMode}</span>
        <span>Получено: {new Date(product.fetchedAt).toLocaleString("ru-RU")}</span>
      </div>
    </article>
  );
}
