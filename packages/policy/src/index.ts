// @churchy/policy — the single permission policy (SDD §11.3, §21.2, §25.4, §25.7, §28).
// Pure TypeScript, zero runtime dependencies; used by the prototype UI and enforced server-side.
// See README.md for the action vocabulary and the matrices.
export { can, explain } from "./policy";
export type { Decision } from "./decision";
export * from "./roles";
export * from "./actor";
export * from "./actions";
export { WEBSITE_MATRIX } from "./website";
export type { WebsiteGrant } from "./website";
export { WORKSPACE_MATRIX } from "./workspace";
export type { WorkspaceGrant } from "./workspace";
