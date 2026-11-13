import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/coverage/**",
      "**/dist/**",
      "**/next-env.d.ts",
      "**/playwright-report/**",
      "**/test-results/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks, "@next/next": nextPlugin },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  {
    // D-90: application code talks to repository interfaces from @churchy/contracts only.
    // Adapters register themselves with the contracts registry; the single composition root
    // `apps/web/server/data-adapters.ts` is the only app file allowed to import them.
    files: ["apps/web/**/*.{ts,tsx,js,jsx,mjs,cjs}", "packages/ui/**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    ignores: ["apps/web/server/data-adapters.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@churchy/data-mock",
                "@churchy/data-mock/*",
                "@churchy/db",
                "@churchy/db/*",
                "**/packages/data-mock",
                "**/packages/data-mock/**",
                "**/packages/db",
                "**/packages/db/**",
              ],
              message:
                "Import repository interfaces from @churchy/contracts and resolve them with getRepositories(); never import a data adapter directly (D-90).",
            },
          ],
        },
      ],
    },
  },
);
