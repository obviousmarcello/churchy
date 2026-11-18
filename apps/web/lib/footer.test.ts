import { describe, expect, it } from "vitest";
import { officeHoursSummary, socialLinks } from "./footer";

describe("officeHoursSummary", () => {
  it("groups consecutive days with the same hours, Monday first, closed days left out", () => {
    expect(
      officeHoursSummary({
        weekly: [
          { weekday: 3, from: "09:00", to: "12:00" },
          { weekday: 1, from: "09:00", to: "12:00" },
          { weekday: 2, from: "09:00", to: "12:00" },
          { weekday: 4, from: "14:00", to: "18:00" },
          { weekday: 6, from: "09:00", to: "12:00" },
        ],
      }),
    ).toEqual([
      { from: 1, to: 3, intervals: [{ from: "09:00", to: "12:00" }] },
      { from: 4, to: 4, intervals: [{ from: "14:00", to: "18:00" }] },
      { from: 6, to: 6, intervals: [{ from: "09:00", to: "12:00" }] },
    ]);
  });

  it("keeps days with several intervals together only when all intervals match", () => {
    const split = [
      { from: "09:00", to: "12:00" },
      { from: "14:00", to: "16:00" },
    ];
    expect(
      officeHoursSummary({
        weekly: [
          { weekday: 1, ...split[0]! },
          { weekday: 1, ...split[1]! },
          { weekday: 2, ...split[0]! },
          { weekday: 2, ...split[1]! },
          { weekday: 3, ...split[0]! },
        ],
      }),
    ).toEqual([
      { from: 1, to: 2, intervals: split },
      { from: 3, to: 3, intervals: [split[0]] },
    ]);
  });

  it("is empty without office hours", () => {
    expect(officeHoursSummary({ weekly: [] })).toEqual([]);
  });
});

describe("socialLinks", () => {
  it("lists the configured https profiles in a fixed order", () => {
    expect(
      socialLinks({
        instagramUrl: "https://www.instagram.com/demo",
        youtubeChannelUrl: "https://www.youtube.com/@demo",
        facebookUrl: "http://www.facebook.com/insecure",
      }),
    ).toEqual([
      { network: "youtube", href: "https://www.youtube.com/@demo" },
      { network: "instagram", href: "https://www.instagram.com/demo" },
    ]);
    expect(socialLinks({})).toEqual([]);
  });
});
