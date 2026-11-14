import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import type { OpeningHours as OpeningHoursData } from "@churchy/contracts";
import type { MessageTree } from "@churchy/i18n";
import huMessages from "@messages/hu.json";
import { TermsProvider } from "@/i18n/client";
import { catalogFor, termsForDenomination } from "@/i18n/terms";
import { OpeningHours } from "./opening-hours";

const terms = termsForDenomination("rk");

function Providers({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider
      locale="hu"
      timeZone="Europe/Budapest"
      messages={catalogFor(huMessages as unknown as MessageTree, terms)}
    >
      <TermsProvider denomination="rk" terms={terms.all()}>
        {children}
      </TermsProvider>
    </NextIntlClientProvider>
  );
}

const OFFICE: OpeningHoursData = {
  weekly: [
    { weekday: 1, from: "09:00", to: "12:00" },
    { weekday: 3, from: "14:00", to: "17:00" },
    { weekday: 5, from: "09:00", to: "12:00" },
  ],
  exceptions: [
    { from: "2026-12-24", to: "2027-01-01", closed: true, note: "Karácsonyi szünet" },
    {
      from: "2026-11-23",
      to: "2026-11-29",
      closed: false,
      hours: [{ weekday: 1, from: "10:00", to: "11:00" }],
      note: null,
    },
  ],
};

const renderAt = (now: string, hours = OFFICE) =>
  render(<OpeningHours hours={hours} now={now} />, { wrapper: Providers });

const todayRow = () => screen.getAllByTestId("opening-hours-row").find((r) => r.dataset.today);

describe("<OpeningHours>", () => {
  it("highlights today and says it is open, with the closing time", () => {
    // Monday 2026-11-16, 10:30 Budapest.
    renderAt("2026-11-16T10:30:00+01:00");
    expect(screen.getByTestId("opening-hours-status")).toHaveTextContent("Most nyitva");
    expect(screen.getByTestId("opening-hours-next")).toHaveTextContent("12:00-ig");
    const today = todayRow()!;
    expect(today).toHaveAttribute("aria-current", "date");
    expect(within(today).getByRole("rowheader")).toHaveTextContent("HétfőMa");
    expect(today).toHaveTextContent("09:00–12:00");
    expect(screen.getAllByTestId("opening-hours-row").filter((r) => r.dataset.today)).toHaveLength(
      1,
    );
  });

  it("says closed and when it opens next", () => {
    // Tuesday 2026-11-17 08:00 → Wednesday 14:00.
    renderAt("2026-11-17T08:00:00+01:00");
    expect(screen.getByTestId("opening-hours-status")).toHaveTextContent("Most zárva");
    expect(screen.getByTestId("opening-hours-next")).toHaveTextContent(
      "Legközelebb: holnap, 14:00",
    );
    expect(todayRow()).toHaveTextContent("Kedd");
    expect(todayRow()).toHaveTextContent("Zárva");
    // Monday morning before opening → later today.
    renderAt("2026-11-16T08:00:00+01:00");
    expect(screen.getAllByTestId("opening-hours-next")[1]).toHaveTextContent("Ma 09:00-kor nyit");
  });

  it("lets an exception override today's hours and lists current and upcoming exceptions", () => {
    // Monday 2026-11-23 09:30: regular hours would be open, the exception says 10–11.
    renderAt("2026-11-23T09:30:00+01:00");
    expect(screen.getByTestId("opening-hours-status")).toHaveTextContent("Most zárva");
    expect(screen.getByTestId("opening-hours-next")).toHaveTextContent("Ma 10:00-kor nyit");
    expect(todayRow()).toHaveTextContent("10:00–11:00");
    expect(screen.getByTestId("opening-hours-today-exception")).toBeInTheDocument();
    const list = screen.getByTestId("opening-hours-exceptions");
    expect(list).toHaveTextContent("Eltérő nyitvatartás: nov. 23–29.");
    expect(list).toHaveTextContent("Hétfő: 10:00–11:00");
    expect(list).toHaveTextContent("Zárva: 2026. dec. 24. – 2027. jan. 1.");
    expect(list).toHaveTextContent("Karácsonyi szünet");
  });

  it("is closed during a closed exception and points past it", () => {
    renderAt("2026-12-28T10:00:00+01:00");
    expect(screen.getByTestId("opening-hours-status")).toHaveTextContent("Most zárva");
    expect(todayRow()).toHaveTextContent("Zárva");
    expect(screen.getByTestId("opening-hours-next")).toHaveTextContent(
      "Legközelebb: hétfő, jan. 4., 09:00",
    );
  });

  it("says so when there are no hours at all", () => {
    renderAt("2026-11-16T10:30:00+01:00", { weekly: [], exceptions: [] });
    expect(screen.getByText("Nincs megadott nyitvatartás.")).toBeInTheDocument();
  });
});
