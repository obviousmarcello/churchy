import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";
import globals from "globals";
import { permissionRulesConfig } from "./eslint.permissions.mjs";
import i18nPlugin from "./packages/eslint-plugin-i18n/src/index.mjs";

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
      ".claude/**",
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
  // D-05: no ad-hoc role checks in UI code (see eslint.permissions.mjs).
  ...permissionRulesConfig,
  // --- D-06 [UI]: no hard-coded user-visible text (PRD L-01) ---------------------------------
  {
    // All UI text lives in messages/hu.json and is read through next-intl. Tests, e2e specs and the
    // showcase-free packages are exempt; the rule and its allowlist are documented in
    // packages/eslint-plugin-i18n/src/no-hardcoded-text.mjs.
    files: ["apps/web/**/*.{ts,tsx}", "packages/ui/**/*.{ts,tsx}", "packages/email/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}", "apps/web/e2e/**", "**/test-setup.ts", "**/testing.ts"],
    plugins: { i18n: i18nPlugin },
    rules: { "i18n/no-hardcoded-text": "error" },
  },
  // --- end D-06 [UI] ---------------------------------------------------------------------------
);
