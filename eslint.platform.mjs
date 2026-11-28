// S1: the platform database (apps/web/server/platform-db, role `churchy_platform`, SDD §4.2) serves
// everything that has no tenant context yet. Tenant code must not be able to use it, so only the
// files below may import it. Kept in its own module (imported by eslint.config.mjs); tested by
// apps/web/lint/platform-db-rule.test.ts. A custom rule (not `no-restricted-imports`) so it does
// not replace the D-90 adapter-import restriction, which uses that rule for the same files.

/** Files (repo-relative, forward slashes) allowed to import `server/platform-db` or `server/signup`. */
export const PLATFORM_DB_ALLOW_LIST = [
  /^apps\/web\/server\/platform-db\//,
  /^apps\/web\/server\/(session|auth|plans)\.ts$/, // actor/identity lookups, sign-in, entitlement sources
  /^apps\/web\/server\/signup[a-z.-]*\.tsx?$/,
  /^apps\/web\/server\/site-builder-[a-z.-]+\.tsx?$/,
  /^apps\/web\/server\/jobs\/site-builder-purge\.ts$/, // worker: purge of expired drafts // operator site builder: drafts, audit, apply
  /^apps\/web\/(proxy|middleware)\.ts$/, // host resolution
  /^apps\/web\/lib\/host-resolution(\.[a-z-]+)*\.ts$/,
  /^apps\/web\/server\/host-resolution(\.[a-z-]+)*\.ts$/,
  /^apps\/web\/app\/\(platform\)\//, // platform console
];

const TARGET = /(^|\/)(platform-db)(\/|$)/;
// `server/signup` itself calls the platform database, so it is as restricted as the module.
const SIGNUP = /(^|\/)server\/signup[a-z.-]*$/;
const POOL_PACKAGE = /^@churchy\/db\/platform$/;

const relative = (filename) => {
  const f = filename.replaceAll("\\", "/");
  const i = f.indexOf("/apps/web/");
  return i === -1 ? f : f.slice(i + 1);
};

/** @type {import("eslint").Rule.RuleModule} */
const noPlatformDbImport = {
  meta: {
    type: "problem",
    docs: { description: "Only the allow-listed files may import server/platform-db (S1)." },
    schema: [],
    messages: {
      forbidden:
        "'{{source}}' is the platform database (role churchy_platform, no tenant context). Only the files listed in eslint.platform.mjs may import it; tenant code goes through the repositories (SDD §4.2).",
      pool: "'@churchy/db/platform' may only be imported by apps/web/server/platform-db/ (S1).",
    },
  },
  create(context) {
    const file = relative(context.filename);
    const allowed = PLATFORM_DB_ALLOW_LIST.some((re) => re.test(file));
    const check = (node, source) => {
      if (typeof source !== "string") return;
      if (POOL_PACKAGE.test(source) && !/^apps\/web\/server\/platform-db\//.test(file)) {
        context.report({ node, messageId: "pool" });
      } else if ((TARGET.test(source) || SIGNUP.test(source)) && !allowed) {
        context.report({ node, messageId: "forbidden", data: { source } });
      }
    };
    return {
      ImportDeclaration: (node) => check(node, node.source.value),
      ExportNamedDeclaration: (node) => node.source && check(node, node.source.value),
      ExportAllDeclaration: (node) => check(node, node.source.value),
      ImportExpression: (node) => node.source.type === "Literal" && check(node, node.source.value),
    };
  },
};

export const platformRulesConfig = [
  {
    files: ["apps/web/**/*.{ts,tsx,js,jsx,mjs,cjs}", "packages/ui/**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    plugins: { platform: { rules: { "no-platform-db-import": noPlatformDbImport } } },
    rules: { "platform/no-platform-db-import": "error" },
  },
];
