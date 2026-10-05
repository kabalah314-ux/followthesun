import { defineConfig } from "vitest/config";

// Configuración independiente de `vite.config.ts` (que incluye Tailwind y el empaquetado en un solo
// archivo, irrelevantes para los tests). Se ejecuta con: npx vitest run
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
