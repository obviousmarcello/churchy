import { describe, expect, it } from "vitest";

import { toOcrPage, toProgress } from "./tesseract-engine";

const bbox = (x0: number, y0: number, x1: number, y1: number) => ({ x0, y0, x1, y1 });

describe("toOcrPage", () => {
  it("gives the lines of all blocks with the place of each word, without empty words and lines", () => {
    const page = toOcrPage(
      {
        blocks: [
          {
            paragraphs: [
              {
                lines: [
                  {
                    bbox: bbox(10, 5, 90, 25),
                    words: [
                      { text: "G", confidence: 91, bbox: bbox(10, 5, 20, 25) },
                      { text: " ", confidence: 10, bbox: bbox(30, 5, 35, 25) },
                      { text: "C ", confidence: 88, bbox: bbox(80, 5, 90, 25) },
                    ],
                  },
                  { bbox: bbox(0, 0, 0, 0), words: [] },
                ],
              },
            ],
          },
          {
            paragraphs: [
              {
                lines: [
                  {
                    bbox: bbox(10, 40, 150, 60),
                    words: [{ text: "Amazing", confidence: 95, bbox: bbox(10, 40, 80, 60) }],
                  },
                ],
              },
            ],
          },
        ],
      },
      { width: 200, height: 100 },
    );

    expect(page).toEqual({
      width: 200,
      height: 100,
      lines: [
        {
          box: { x: 10, y: 5, width: 80, height: 20 },
          words: [
            { text: "G", box: { x: 10, y: 5, width: 10, height: 20 }, confidence: 0.91 },
            { text: "C", box: { x: 80, y: 5, width: 10, height: 20 }, confidence: 0.88 },
          ],
        },
        {
          box: { x: 10, y: 40, width: 140, height: 20 },
          words: [
            { text: "Amazing", box: { x: 10, y: 40, width: 70, height: 20 }, confidence: 0.95 },
          ],
        },
      ],
    });
  });

  it("gives no lines for a result without blocks", () => {
    expect(toOcrPage({ blocks: null }, { width: 1, height: 1 }).lines).toEqual([]);
  });
});

describe("toProgress", () => {
  it("maps the status texts of Tesseract.js to the stages", () => {
    expect(toProgress({ status: "loading tesseract core", progress: 0.5 })).toEqual({
      stage: "download",
      ratio: 0.5,
    });
    expect(toProgress({ status: "loading language traineddata", progress: 1 })).toEqual({
      stage: "download",
      ratio: 1,
    });
    expect(toProgress({ status: "initializing api", progress: 0 })).toEqual({
      stage: "load",
      ratio: 0,
    });
    expect(toProgress({ status: "recognizing text", progress: 0.25 })).toEqual({
      stage: "recognize",
      ratio: 0.25,
    });
  });
});
