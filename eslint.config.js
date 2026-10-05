import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "docs/**"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { parser: tseslint.parser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      // Los avisos pasan por src/lib/log.ts (silenciado en producción).
      "no-console": "error",
    },
  },
  {
    files: ["src/lib/log.ts", "src/**/__tests__/**"],
    rules: { "no-console": "off" },
  }
);
