// The XML helpers of the file writers (`projection/pptx.ts`, `xlsx.ts`). A
// module of its own, so that a writer does not load the code of the others.

/** Escapes the text for XML, and leaves out the characters that XML does not allow. */
export function escapeXml(text: string): string {
  return text
    .replace(
      // eslint-disable-next-line no-control-regex -- strips the characters that XML 1.0 cannot hold
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
      "",
    )
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
