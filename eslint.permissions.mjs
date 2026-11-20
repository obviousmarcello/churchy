// D-05 [UI]: permissions come from `can()` (CLAUDE.md rule 3). Ad-hoc role checks are forbidden in
// UI code. Only the session seam may touch role lists; it builds the actor that `can()` consumes.
// Kept in its own module (imported by eslint.config.mjs) so it is easy to find and test.

const ROLES = [
  // website (SDD §11.3)
  "owner",
  "admin",
  "editor",
  "office",
  "groupLeader",
  // workspace (SDD §21.2)
  "leader",
  "employee",
  "volunteer",
  "teamLeader",
  "musicLeader",
  "roomManager",
  "hrHandler",
  "confidentialHandler",
  // organization (SDD §25.7)
  "orgHrAdmin",
  "orgHrHandler",
  "orgConfidentialHandler",
];
const ROLE_RE = `^(${ROLES.join("|")})$`;
const ROLE_LISTS = "^(websiteRoles|workspaceRoles|orgRoles)$";
const MESSAGE =
  "Do not check roles in UI code. Decide visibility with can() from @churchy/policy " +
  "(useCan / <Can> / canServer / filterNav). Only apps/web/server/session.ts may read role lists.";

export const permissionSelectors = [
  // actor.websiteRoles / actor["workspaceRoles"]
  { selector: `MemberExpression[property.name=/${ROLE_LISTS}/]`, message: MESSAGE },
  { selector: `MemberExpression[computed=true][property.value=/${ROLE_LISTS}/]`, message: MESSAGE },
  // const { websiteRoles } = actor
  { selector: `ObjectPattern > Property[key.name=/${ROLE_LISTS}/]`, message: MESSAGE },
  // role === "editor", "editor" !== role
  {
    selector: `BinaryExpression[operator=/^(===|!==|==|!=)$/] > Literal[value=/${ROLE_RE}/]`,
    message: MESSAGE,
  },
  // roles.includes("editor"), set.has("editor"), roles.indexOf("editor")
  {
    selector: `CallExpression[callee.property.name=/^(includes|has|indexOf)$/] > Literal.arguments[value=/${ROLE_RE}/]`,
    message: MESSAGE,
  },
  // switch (role) { case "editor": }
  { selector: `SwitchCase > Literal.test[value=/${ROLE_RE}/]`, message: MESSAGE },
];

/** Flat-config block; imported by eslint.config.mjs. */
export const permissionRulesConfig = [
  {
    files: ["apps/web/**/*.{ts,tsx,js,jsx,mjs,cjs}", "packages/ui/**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    ignores: ["apps/web/server/session.ts"],
    rules: { "no-restricted-syntax": ["error", ...permissionSelectors] },
  },
];
