import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { registerServiceWorker } from "./lib/registerServiceWorker";
import { registerAffiliates } from "./services/affiliate/register";
import { registerOpenMedia } from "./services/media/register";

// Fotos y 360° abiertos para la ficha; enlaces de afiliado solo si hay programas configurados.
registerOpenMedia();
registerAffiliates();

// Vercel Web Analytics (sin cookies) solo si se ha activado en el panel de Vercel y se ha puesto
// VITE_VERCEL_ANALYTICS=1: así no hay peticiones fallidas mientras no esté activo.
if (import.meta.env.VITE_VERCEL_ANALYTICS === "1") {
  const s = document.createElement("script");
  s.defer = true;
  s.src = "/_vercel/insights/script.js";
  document.head.appendChild(s);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

registerServiceWorker();
