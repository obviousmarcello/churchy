import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ObfuscatedEmail, decodeEmail, encodeEmail, spokenEmail } from "../index";

const EMAIL = "kelemen.ambrus@pelda.hu";

describe("email obfuscation", () => {
  it("round-trips an address through an opaque code", () => {
    const code = encodeEmail(EMAIL);
    expect(code).not.toContain("@");
    expect(code).not.toContain("pelda");
    expect(decodeEmail(code)).toBe(EMAIL);
  });

  it("rejects codes that are not an encoded address", () => {
    expect(decodeEmail("%%%")).toBeNull();
    expect(decodeEmail(btoa("nem cim"))).toBeNull();
  });

  it("spells the address for people", () => {
    expect(spokenEmail(EMAIL, "kukac", "pont")).toBe("kelemen.ambrus [kukac] pelda [pont] hu");
  });

  it("server HTML has neither the address nor a mailto link", () => {
    const html = renderToString(
      <ObfuscatedEmail code={encodeEmail(EMAIL)} atWord="kukac" dotWord="pont" />,
    );
    expect(html).not.toContain("@");
    expect(html).not.toContain("mailto:");
    expect(html).toContain("kelemen.ambrus [kukac] pelda [pont] hu");
  });

  it("becomes a mailto link after hydration", () => {
    render(<ObfuscatedEmail code={encodeEmail(EMAIL)} atWord="kukac" dotWord="pont" />);
    expect(screen.getByRole("link", { name: EMAIL })).toHaveAttribute("href", `mailto:${EMAIL}`);
  });

  it("renders nothing for an invalid code", () => {
    const { container } = render(<ObfuscatedEmail code="x" atWord="kukac" dotWord="pont" />);
    expect(container.innerHTML).toBe("");
  });
});
