import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearOutbox } from "@/server/data-adapters";
import { GET } from "./route";

const original = process.env.HIDE_DEV_ROUTES;
beforeEach(clearOutbox);
afterEach(() => {
  if (original === undefined) delete process.env.HIDE_DEV_ROUTES;
  else process.env.HIDE_DEV_ROUTES = original;
});

describe("outbox revision endpoint", () => {
  it("returns a change marker without content", async () => {
    delete process.env.HIDE_DEV_ROUTES;
    const response = GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revision: "0:" });
  });

  it("is a 404 when dev routes are hidden", () => {
    process.env.HIDE_DEV_ROUTES = "1";
    expect(GET().status).toBe(404);
  });
});
