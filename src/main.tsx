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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

registerServiceWorker();
