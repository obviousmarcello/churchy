/**
 * Runs EVERY contract suite against the in-test reference implementation. Only the modules the
 * reference implements (announcements, locations) execute; all others are registered as skipped
 * until an adapter provides them. Adapters plug in the same way — see README "Adapters".
 */
import { createReferenceSetup } from "./reference/reference-adapter";
import { runContractSuites } from "./index";

runContractSuites("reference", createReferenceSetup, {
  modules: ["announcements", "locations"],
});
