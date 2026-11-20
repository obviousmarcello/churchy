import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Address, BankAccount, FormattedDate, FormattedTime, PersonName, Phone } from "../index";

describe("FormattedDate", () => {
  it("defaults to the long Hungarian format inside <time>", () => {
    render(<FormattedDate value="2026-11-12" data-testid="d" />);
    const el = screen.getByTestId("d");
    expect(el.tagName).toBe("TIME");
    expect(el).toHaveTextContent("2026. november 12., csütörtök");
    expect(el).toHaveAttribute("datetime", "2026-11-12");
  });

  it.each([
    ["short", "2026. 11. 12."],
    ["monthDay", "nov. 12."],
    ["monthDayLong", "november 12."],
    ["weekRange", "nov. 9–15."],
  ] as const)("format %s", (format, text) => {
    render(<FormattedDate value="2026-11-12" format={format} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("relative labels use the explicit now (Budapest time)", () => {
    const now = "2026-11-12T10:00:00+01:00";
    const { rerender } = render(<FormattedDate value="2026-11-13" format="relative" now={now} />);
    expect(screen.getByText("Holnap")).toBeInTheDocument();
    rerender(<FormattedDate value="2026-11-12" format="relative" now={now} lowercase />);
    expect(screen.getByText("ma")).toBeInTheDocument();
  });

  it("converts instants to Budapest civil dates", () => {
    render(<FormattedDate value="2026-11-12T23:30:00Z" format="short" />);
    expect(screen.getByText("2026. 11. 13.")).toBeInTheDocument();
  });

  it("passes attributes through", () => {
    render(<FormattedDate value="2026-11-12" className="x" />);
    expect(document.querySelector("time")).toHaveClass("x");
  });
});

describe("FormattedTime", () => {
  it("clock, spoken and range", () => {
    const { rerender } = render(<FormattedTime value="18:00" />);
    expect(screen.getByText("18:00")).toHaveAttribute("datetime", "18:00");
    rerender(<FormattedTime value="18:30" style="spoken" />);
    expect(screen.getByText("18 óra 30 perc")).toBeInTheDocument();
    rerender(<FormattedTime value="18:00" end="19:30" />);
    expect(screen.getByText("18:00–19:30")).toBeInTheDocument();
  });

  it("shows instants in Budapest time across the DST switch", () => {
    render(<FormattedTime value="2026-03-29T01:00:00Z" />);
    expect(screen.getByText("03:00")).toHaveAttribute("datetime", "03:00");
  });
});

describe("PersonName", () => {
  it("is family-name-first with titles, and optionally without", () => {
    const name = { prefix: "dr.", familyName: "Minta", givenName: "Katalin", suffix: "PhD" };
    const { rerender } = render(<PersonName name={name} />);
    expect(screen.getByText("dr. Minta Katalin PhD")).toBeInTheDocument();
    rerender(<PersonName name={name} titles={false} />);
    expect(screen.getByText("Minta Katalin")).toBeInTheDocument();
  });
});

describe("Address", () => {
  it("uses Hungarian order", () => {
    render(
      <Address
        address={{ postalCode: "1011", city: "Budapest", street: "Fő utca", houseNumber: "1" }}
      />,
    );
    expect(screen.getByText("1011 Budapest, Fő utca 1.")).toBeInTheDocument();
  });
});

describe("Phone", () => {
  it("normalises and optionally links", () => {
    const { rerender } = render(<Phone value="06 30 1234567" />);
    expect(screen.getByText("+36 30 123 4567").tagName).toBe("SPAN");
    rerender(<Phone value="06 30 1234567" link />);
    expect(screen.getByRole("link", { name: "+36 30 123 4567" })).toHaveAttribute(
      "href",
      "tel:+36301234567",
    );
  });

  it("shows foreign numbers as entered and never links them", () => {
    render(<Phone value="+44 20 7946 0958" link />);
    expect(screen.getByText("+44 20 7946 0958")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("BankAccount", () => {
  it("formats 8-8-8 and IBAN", () => {
    const { rerender } = render(<BankAccount value="117730161111101800000000" />);
    expect(screen.getByText("11773016-11111018-00000000")).toBeInTheDocument();
    rerender(<BankAccount value="11773016-11111018-00000000" format="iban" />);
    expect(screen.getByText("HU42 1177 3016 1111 1018 0000 0000")).toBeInTheDocument();
    rerender(<BankAccount value="HU42 1177 3016 1111 1018 0000 0000" format="iban" />);
    expect(screen.getByText("HU42 1177 3016 1111 1018 0000 0000")).toBeInTheDocument();
    rerender(<BankAccount value=" nem szám " format="iban" />);
    expect(screen.getByText("nem szám")).toBeInTheDocument();
  });
});
