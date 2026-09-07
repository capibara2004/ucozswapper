import { Link2 } from "lucide-react";
import { normalizeMarketplace } from "../lib/marketplace";

function AvitoIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 410 380" role="img" aria-label="Avito" xmlns="http://www.w3.org/2000/svg">
      <circle cx="123" cy="257" r="123" fill="#04E061" />
      <circle cx="336" cy="290" r="74" fill="#FF4053" />
      <circle cx="146" cy="72" r="46" fill="#965EEB" />
      <circle cx="307" cy="100" r="100" fill="#00AAFF" />
    </svg>
  );
}

function WildberriesIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 42 28" role="img" aria-label="Wildberries" xmlns="http://www.w3.org/2000/svg">
      <text x="21" y="20" textAnchor="middle" fill="currentColor" fontFamily="Arial, sans-serif" fontSize="18" fontWeight="900">wb</text>
    </svg>
  );
}

export default function MarketplaceIcon({ marketplace, className = "" }) {
  const normalized = normalizeMarketplace(marketplace);
  if (normalized === "avito") return <AvitoIcon className={className} />;
  if (normalized === "wb") return <WildberriesIcon className={className} />;
  return <Link2 className={className} aria-label="Определить маркетплейс по URL" />;
}
