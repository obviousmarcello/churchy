import { describe, expect, it } from "vitest";

import { decodeOsc, encodeOsc } from "./osc";

const bytes = (text: string) => [...text].map((char) => char.charCodeAt(0));

describe("encodeOsc", () => {
  it("pads the address and the type tags to 4 bytes and writes a big-endian float", () => {
    const packet = encodeOsc({ address: "/fx/1/par/02", args: [{ type: "f", value: 0.5 }] });
    expect([...packet]).toEqual([
      ...bytes("/fx/1/par/02"),
      0,
      0,
      0,
      0,
      ...bytes(",f"),
      0,
      0,
      0x3f,
      0x00,
      0x00,
      0x00,
    ]);
  });

  it("writes a message without arguments with an empty type tag", () => {
    expect([...encodeOsc({ address: "/fx/1/type", args: [] })]).toEqual([
      ...bytes("/fx/1/type"),
      0,
      0,
      ...bytes(","),
      0,
      0,
      0,
    ]);
  });
});

describe("decodeOsc", () => {
  it("reads the answer of the desk to /fx/<slot>/type", () => {
    const answer = encodeOsc({ address: "/fx/1/type", args: [{ type: "i", value: 10 }] });
    expect(decodeOsc(answer)).toEqual({ address: "/fx/1/type", args: [{ type: "i", value: 10 }] });
  });

  it("reads floats and strings", () => {
    const message = {
      address: "/a",
      args: [
        { type: "s", value: "Stereo" },
        { type: "f", value: 0.25 },
      ],
    } as const;
    expect(decodeOsc(encodeOsc({ ...message, args: [...message.args] }))).toEqual(message);
  });

  it("rejects data that is not a message", () => {
    expect(decodeOsc(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(decodeOsc(new Uint8Array([...bytes("/a"), 0, 0, ...bytes(",i"), 0, 0, 0]))).toBeNull();
    expect(decodeOsc(new Uint8Array([...bytes("/a"), 0, 0, ...bytes(",b"), 0, 0]))).toBeNull();
  });
});
