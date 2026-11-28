import type messages from "../../messages/hu.json";

// Typed message keys for next-intl: a wrong key fails `pnpm typecheck`.
declare module "next-intl" {
  interface AppConfig {
    Locale: "hu";
    Messages: typeof messages;
  }
}
