// Open Sound Control (OSC) 1.0 messages, the protocol of many digital mixing
// desks on the network (UDP). A message is the address, the type tags and the
// arguments. Each part is a multiple of 4 bytes; numbers are big-endian.
// Only the types that the desks use here: int32, float32 and string.

export type OscArg =
  { type: "i"; value: number } | { type: "f"; value: number } | { type: "s"; value: string };

export type OscMessage = { address: string; args: OscArg[] };

/** The bytes of `text` and a 0 byte, padded with 0 bytes to a multiple of 4. ASCII only. */
function oscString(text: string): number[] {
  const bytes = [...text].map((char) => char.charCodeAt(0) & 0x7f);
  const length = Math.ceil((bytes.length + 1) / 4) * 4;
  return [...bytes, ...new Array<number>(length - bytes.length).fill(0)];
}

export function encodeOsc({ address, args }: OscMessage): Uint8Array {
  const bytes = [...oscString(address), ...oscString("," + args.map((arg) => arg.type).join(""))];
  for (const arg of args) {
    if (arg.type === "s") {
      bytes.push(...oscString(arg.value));
      continue;
    }
    const view = new DataView(new ArrayBuffer(4));
    if (arg.type === "i") view.setInt32(0, arg.value);
    else view.setFloat32(0, arg.value);
    bytes.push(...new Uint8Array(view.buffer));
  }
  return new Uint8Array(bytes);
}

/** Null when `data` is not a valid message, or has a type that this file does not read. */
export function decodeOsc(data: Uint8Array): OscMessage | null {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  function readString(): string | null {
    const end = data.indexOf(0, offset);
    if (end < 0) return null;
    const text = String.fromCharCode(...data.subarray(offset, end));
    offset = Math.ceil((end + 1) / 4) * 4;
    return text;
  }

  const address = readString();
  if (address === null || !address.startsWith("/")) return null;
  // A message without arguments can leave out the type tags.
  if (offset >= data.length) return { address, args: [] };
  const tags = readString();
  if (tags === null || !tags.startsWith(",")) return null;

  const args: OscArg[] = [];
  for (const type of tags.slice(1)) {
    if (type === "s") {
      const value = readString();
      if (value === null) return null;
      args.push({ type, value });
      continue;
    }
    if ((type !== "i" && type !== "f") || offset + 4 > data.length) return null;
    args.push({ type, value: type === "i" ? view.getInt32(offset) : view.getFloat32(offset) });
    offset += 4;
  }
  return { address, args };
}
