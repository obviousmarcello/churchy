import { describe, expect, it } from "vitest";

import {
  HOME_PATH,
  isAccountPath,
  isFullScreenPath,
  isNavActive,
  isPublicPath,
  newEventHref,
  newSongHref,
  PRIVACY_PATH,
  projectionHref,
  projectionOverlayHref,
  projectionScreenHref,
  safeNextPath,
} from "./next-path";

describe("isPublicPath", () => {
  it("opens the sign-in pages and the privacy notice without a session", () => {
    expect(isPublicPath("/account")).toBe(true);
    expect(isPublicPath("/account/login")).toBe(true);
    expect(isPublicPath(PRIVACY_PATH)).toBe(true);
    expect(isPublicPath("/privacy/x")).toBe(false);
    expect(isPublicPath("/munkater/enektar")).toBe(false);
  });

  it("keeps the privacy notice out of the sign-in pages", () => {
    expect(isAccountPath("/account/login")).toBe(true);
    expect(isAccountPath(PRIVACY_PATH)).toBe(false);
  });
});

describe("isFullScreenPath", () => {
  it("covers the sheet and the three projection pages", () => {
    expect(isFullScreenPath("/munkater/kotta")).toBe(true);
    expect(isFullScreenPath("/project")).toBe(true);
    expect(isFullScreenPath("/project/screen")).toBe(true);
    expect(isFullScreenPath("/project/overlay")).toBe(true);
    expect(isFullScreenPath("/projects")).toBe(false);
    expect(isFullScreenPath("/munkater/enektar")).toBe(false);
  });
});

describe("the projection pages", () => {
  it("open the projection of an event or of the rehearsal", () => {
    expect(projectionHref("e1")).toBe("/project?event=e1");
    expect(projectionHref(null)).toBe("/project?rehearsal");
    expect(projectionScreenHref("e1")).toBe("/project/screen?event=e1");
    expect(projectionScreenHref(null)).toBe("/project/screen?rehearsal");
  });

  it("open the stream overlay of an event, with the background only when it is not the default", () => {
    expect(projectionOverlayHref("e1", "black")).toBe("/project/overlay?event=e1");
    expect(projectionOverlayHref("e1", "green")).toBe("/project/overlay?event=e1&background=green");
  });
});

describe("isNavActive", () => {
  it("marks the page and the pages below it", () => {
    expect(isNavActive("/events", "/events")).toBe(true);
    expect(isNavActive("/events/123", "/events")).toBe(true);
    expect(isNavActive("/events-old", "/events")).toBe(false);
    expect(isNavActive("/munkater/enektar", "/events")).toBe(false);
  });

  it("marks home only on the home page", () => {
    expect(isNavActive(HOME_PATH, HOME_PATH)).toBe(true);
    expect(isNavActive("/munkater/enektar", HOME_PATH)).toBe(false);
  });
});

describe("the pages that add", () => {
  it("fill in the typed title or email", () => {
    expect(newSongHref("Áldjad & dicsérd")).toBe(
      "/munkater/enektar/uj?title=%C3%81ldjad+%26+dics%C3%A9rd",
    );
    expect(newEventHref("Sunday")).toBe("/events/new?title=Sunday");
  });

  it("have no parameter without a value", () => {
    expect(newSongHref()).toBe("/munkater/enektar/uj");
    expect(newEventHref("")).toBe("/events/new");
  });
});

describe("safeNextPath", () => {
  it("accepts a path on this site", () => {
    expect(safeNextPath("/munkater/enektar?song=1")).toBe("/munkater/enektar?song=1");
    expect(safeNextPath(PRIVACY_PATH)).toBe(PRIVACY_PATH);
  });

  it("refuses the sign-in pages and other sites", () => {
    expect(safeNextPath("/account/login")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
  });
});
