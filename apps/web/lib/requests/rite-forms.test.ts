import { describe, expect, it } from "vitest";
// eslint-disable-next-line no-restricted-imports -- seed-data check, not application code
import { defaultDemoDataset } from "@churchy/data-mock";
import { getPreset } from "@churchy/presets";

/**
 * D-28 AC1: every rite of a church's preset has a request form definition (its key is the rite's
 * key), each with the contact fields and a reference prefix.
 */
describe("preset rite forms in the demo data", () => {
  const ds = defaultDemoDataset();
  const tenants = ds.tenants.filter((t) => ds.formDefinitions.some((f) => f.tenantId === t.id));

  it("covers the three demo churches", () => {
    expect(tenants.map((t) => t.denomination).sort()).toEqual(["bapt", "ref", "rk"]);
  });

  for (const tenant of tenants) {
    it(`${tenant.denomination}: every rite has an active form with contact fields`, () => {
      const forms = ds.formDefinitions.filter((f) => f.tenantId === tenant.id);
      for (const rite of getPreset(tenant.denomination).rites) {
        const form = forms.find((f) => f.key === rite.key);
        expect(form, rite.key).toBeDefined();
        expect(form?.active).toBe(true);
        expect(form?.referencePrefix).toMatch(/^[A-Z]{2,5}$/);
        const keys = form?.fields.map((f) => f.key) ?? [];
        expect(keys).toEqual(expect.arrayContaining(["contactName", "email", "phone"]));
      }
    });
  }
});
