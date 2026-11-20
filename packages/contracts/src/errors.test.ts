import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ContractError,
  conflict,
  isContractError,
  notFound,
  parseInput,
  validationError,
} from "./errors";

describe("ContractError", () => {
  it("carries code, details and issues", () => {
    const error = conflict("Ütközés", { conflictingBookingId: "b-1" });
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("CONFLICT");
    expect(error.details).toEqual({ conflictingBookingId: "b-1" });
    expect(error.issues).toEqual([]);
    expect(notFound("Location", "l-1").message).toBe("Location l-1 not found");
    expect(notFound("Location").details).toEqual({ entity: "Location" });
    expect(validationError([{ path: ["a"], message: "x" }]).issues).toHaveLength(1);
  });

  it("is recognised by duck typing, optionally by code", () => {
    const error = new ContractError("NOT_FOUND", "x");
    expect(isContractError(error)).toBe(true);
    expect(isContractError(error, "NOT_FOUND")).toBe(true);
    expect(isContractError(error, "CONFLICT")).toBe(false);
    expect(isContractError({ name: "ContractError", code: "NOT_FOUND" })).toBe(true);
    expect(isContractError({ name: "ContractError", code: "WHATEVER" })).toBe(false);
    expect(isContractError(new Error("x"))).toBe(false);
    expect(isContractError(null)).toBe(false);
    expect(isContractError("x")).toBe(false);
  });

  it("parseInput returns parsed data or throws VALIDATION with issue paths", () => {
    const schema = z.object({ name: z.string().min(1), count: z.number().default(1) });
    expect(parseInput(schema, { name: "Anna" })).toEqual({ name: "Anna", count: 1 });
    try {
      parseInput(schema, { name: "" });
      expect.unreachable();
    } catch (error) {
      expect(isContractError(error, "VALIDATION")).toBe(true);
      expect((error as ContractError).issues[0]?.path).toEqual(["name"]);
    }
  });
});
