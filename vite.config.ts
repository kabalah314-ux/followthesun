import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Por defecto se genera un build normal, con división de código (los paneles se descargan al
// abrirlos). `SINGLE_FILE=1 npm run build` produce el `index.html` único de antes, para publicarlo
// como un solo fichero.
const singleFile = process.env.SINGLE_FILE === "1";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), ...(singleFile ? [viteSingleFile()] : [])],
  server: { host: "0.0.0.0", port: 3000, allowedHosts: true },
  preview: { host: "0.0.0.0", port: 3000, allowedHosts: true },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
