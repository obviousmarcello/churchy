import { afterEach, describe, expect, it, vi } from "vitest";

import { hasPendingSaves, registerPendingSave, savePendingChanges } from "./pending-saves";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function register(pending: boolean, saved: boolean | Error) {
  const save = vi.fn(() =>
    saved instanceof Error ? Promise.reject(saved) : Promise.resolve(saved),
  );
  cleanups.push(registerPendingSave({ pending: () => pending, save }));
  return save;
}

describe("pending saves", () => {
  it("has no pending saves without forms or without changes", async () => {
    expect(hasPendingSaves()).toBe(false);
    const save = register(false, true);
    expect(hasPendingSaves()).toBe(false);
    expect(await savePendingChanges()).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it("saves only the forms with changes", async () => {
    const idle = register(false, true);
    const changed = register(true, true);
    expect(hasPendingSaves()).toBe(true);
    expect(await savePendingChanges()).toBe(true);
    expect(idle).not.toHaveBeenCalled();
    expect(changed).toHaveBeenCalledOnce();
  });

  it("is false when a save fails or throws", async () => {
    register(true, true);
    register(true, false);
    expect(await savePendingChanges()).toBe(false);
    for (const cleanup of cleanups.splice(0)) cleanup();
    register(true, new Error("offline"));
    expect(await savePendingChanges()).toBe(false);
  });

  it("forgets a form after its cleanup", () => {
    register(true, true);
    for (const cleanup of cleanups.splice(0)) cleanup();
    expect(hasPendingSaves()).toBe(false);
  });
});
