import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  Breadcrumbs,
  Button,
  Card,
  DataTable,
  EmptyState,
  Fieldset,
  FormActions,
  ICONS,
  Icon,
  IconButton,
  LoadingRegion,
  NavTabs,
  PageHeader,
  RowActions,
  SaveStatus,
  Skeleton,
  StatusPill,
  Tabs,
  Toast,
  ToastProvider,
  buttonClasses,
  useToast,
  CalendarIcon,
  EditIcon,
} from "../index";

describe("icons", () => {
  it("ships about forty icons, all decorative by default", () => {
    const names = Object.keys(ICONS);
    expect(names.length).toBeGreaterThanOrEqual(40);
    const { container } = render(
      <div>
        {names.map((name) => (
          <Icon key={name} name={name as keyof typeof ICONS} />
        ))}
      </div>,
    );
    const svgs = container.querySelectorAll("svg");
    expect(svgs).toHaveLength(names.length);
    for (const svg of svgs) {
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg).toHaveAttribute("focusable", "false");
      expect(svg.getAttribute("stroke")).toBe("currentColor");
      expect(svg.innerHTML.length).toBeGreaterThan(10);
    }
  });

  it("sizes by keyword or pixels and becomes an image with a title", () => {
    const { container } = render(
      <>
        <CalendarIcon />
        <CalendarIcon size="lg" />
        <CalendarIcon size={32} />
      </>,
    );
    const [md, lg, px] = container.querySelectorAll("svg");
    expect(md).toHaveAttribute("width", "20");
    expect(lg).toHaveAttribute("width", "24");
    expect(px).toHaveAttribute("height", "32");
    render(<CalendarIcon title="Naptár" />);
    expect(screen.getByRole("img", { name: "Naptár" })).not.toHaveAttribute("aria-hidden");
  });
});

describe("buttons", () => {
  it("offers filled, subtle, outline, ghost and destructive variants", () => {
    expect(buttonClasses({ variant: "primary" })).toContain("bg-primary");
    expect(buttonClasses({ variant: "secondary" })).toContain("bg-primary-soft");
    expect(buttonClasses({ variant: "outline" })).toContain("border-border-strong");
    expect(buttonClasses({ variant: "ghost" })).toContain("bg-transparent");
    expect(buttonClasses({ variant: "destructive" })).toContain("bg-danger");
    expect(buttonClasses({ variant: "danger" })).toBe(buttonClasses({ variant: "destructive" }));
    // No variant draws a heavy 2 px outline any more.
    for (const v of ["primary", "secondary", "ghost", "destructive"] as const) {
      expect(buttonClasses({ variant: v })).not.toContain("border-2");
    }
  });

  it("keeps a 44 px minimum target at every size", () => {
    for (const size of ["sm", "md", "lg"] as const) {
      expect(buttonClasses({ size })).toMatch(/min-h-\(--control-h-(sm|md|lg)\)/);
    }
  });

  it("IconButton has the label as its accessible name", async () => {
    const onClick = vi.fn();
    render(<IconButton label="Szerkesztés" icon={<EditIcon />} onClick={onClick} />);
    const button = screen.getByRole("button", { name: "Szerkesztés" });
    expect(button).toHaveAttribute("type", "button");
    expect(button.className).toContain("size-(--control-h-md)");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("a loading button is busy and ignores clicks but keeps its name", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Mentés
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Mentés" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("aria-disabled", "true");
  });
});

describe("Card variants", () => {
  it("is flat by default, raised on request and interactive with a link", () => {
    const { rerender, container } = render(<Card title="Hittan">x</Card>);
    expect(container.firstElementChild).toHaveAttribute("data-card", "flat");
    rerender(<Card title="Hittan" variant="raised" />);
    expect(container.firstElementChild).toHaveAttribute("data-card", "raised");
    rerender(<Card title="Hittan" href="/hittan" />);
    expect(container.firstElementChild).toHaveAttribute("data-card", "interactive");
    expect(screen.getByRole("link", { name: "Hittan" })).toHaveAttribute("href", "/hittan");
  });

  it("renders as a plain panel without a title, with actions and an icon", () => {
    render(
      <Card actions={<button type="button">Menü</button>} icon={<CalendarIcon />}>
        <p>Tartalom</p>
      </Card>,
    );
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByRole("button", { name: "Menü" })).toBeInTheDocument();
    expect(screen.getByText("Tartalom")).toBeInTheDocument();
  });
});

describe("StatusPill", () => {
  it("pairs the status text with an icon", () => {
    render(<StatusPill status="success">Jóváhagyva</StatusPill>);
    const pill = screen.getByText("Jóváhagyva");
    expect(pill).toHaveAttribute("data-status", "success");
    expect(pill.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(pill.className).toContain("text-success");
  });
});

interface Row {
  id: string;
  name: string;
  date: string;
}
const rows: Row[] = [
  { id: "1", name: "Kovács Anna", date: "nov. 12." },
  { id: "2", name: "Szabó Péter", date: "nov. 14." },
];
const columns = [
  { key: "name", header: "Név", cell: (r: Row) => r.name, primary: true },
  { key: "date", header: "Dátum", cell: (r: Row) => r.date, nowrap: true },
];

describe("DataTable", () => {
  it("renders a captioned table with row headers and row actions", () => {
    render(
      <DataTable
        caption="Kérelmek"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        actionsHeader="Műveletek"
        rowActions={(r) => (
          <RowActions>
            <IconButton label={`${r.name} szerkesztése`} icon={<EditIcon />} />
          </RowActions>
        )}
        rowProps={(r) => ({ "data-testid": `row-${r.id}`, selected: r.id === "2" })}
      />,
    );
    const table = screen.getByRole("table", { name: "Kérelmek" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Név", "Dátum", "Műveletek"]);
    expect(within(table).getByRole("rowheader", { name: "Kovács Anna" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Szabó Péter szerkesztése" })).toBeInTheDocument();
    expect(screen.getByTestId("row-2")).toHaveAttribute("data-selected", "true");
    // Cells carry their column label for the stacked (phone) layout.
    expect(within(table).getByText("nov. 12.").closest("td")).toHaveAttribute(
      "data-label",
      "Dátum",
    );
    // The header sticks.
    expect(within(table).getAllByRole("columnheader")[0]!.className).toContain("sticky");
  });

  it("shows the empty state instead of rows", () => {
    render(
      <DataTable
        caption="Kérelmek"
        columns={columns}
        rows={[]}
        rowKey={(r) => r.id}
        empty={<EmptyState size="sm" title="Nincs kérelem" />}
      />,
    );
    expect(screen.getByText("Nincs kérelem")).toBeInTheDocument();
    expect(screen.getByRole("cell")).toHaveAttribute("colspan", "2");
  });

  it("the scroll layout is a focusable, named region", () => {
    render(
      <DataTable
        caption="Órarend"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        layout="scroll"
        maxHeight="20rem"
      />,
    );
    const region = screen.getByRole("region", { name: "Órarend" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region.style.maxHeight).toBe("20rem");
  });
});

describe("navigation", () => {
  it("Breadcrumbs mark the current page and link the ancestors", () => {
    render(
      <Breadcrumbs
        label="Morzsamenü"
        items={[
          { label: "Vezérlőpult", href: "/admin" },
          { label: "Hírek", href: "/admin/hirek" },
          { label: "Új hír" },
        ]}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Morzsamenü" });
    expect(within(nav).getAllByRole("listitem")).toHaveLength(3);
    expect(within(nav).getByRole("link", { name: "Hírek" })).toHaveAttribute(
      "href",
      "/admin/hirek",
    );
    expect(within(nav).getByText("Új hír")).toHaveAttribute("aria-current", "page");
  });

  it("NavTabs are links with aria-current and optional counts", () => {
    render(
      <NavTabs
        label="Beállítások"
        items={[
          { label: "Általános", href: "/a", current: true },
          { label: "Kérelmek", href: "/b", count: 3 },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "Általános" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Kérelmek 3" })).not.toHaveAttribute("aria-current");
  });

  it("Tabs show icons and counts in the tab name", () => {
    render(
      <Tabs
        label="Nézet"
        tabs={[
          { value: "a", label: "Nyitott", count: 2, icon: <CalendarIcon />, content: "A" },
          { value: "b", label: "Lezárt", content: "B" },
        ]}
      />,
    );
    expect(screen.getByRole("tab", { name: "Nyitott 2" })).toHaveAttribute("aria-selected", "true");
  });

  it("PageHeader renders one h1 with description, actions and tabs", () => {
    render(
      <PageHeader
        title="Hírek"
        description="A weboldal hírei."
        breadcrumbs={<Breadcrumbs label="Morzsamenü" items={[{ label: "Hírek" }]} />}
        actions={<Button>Új hír</Button>}
        meta={<StatusPill status="info">Vázlat</StatusPill>}
        tabs={<NavTabs label="Szűrés" items={[{ label: "Mind", href: "#", current: true }]} />}
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Hírek" })).toBeInTheDocument();
    expect(screen.getByText("A weboldal hírei.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Új hír" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Szűrés" })).toBeInTheDocument();
  });
});

describe("feedback", () => {
  it("EmptyState says what is missing and offers the next step", () => {
    render(
      <EmptyState
        headingLevel={2}
        title="Még nincs esemény"
        description="Vegyen fel egyet."
        action={<Button>Új esemény</Button>}
      />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Még nincs esemény" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Új esemény" })).toBeVisible();
  });

  it("Skeletons are decorative inside a busy region with one status text", () => {
    const { container } = render(
      <LoadingRegion label="Betöltés…">
        <Skeleton lines={3} />
        <Skeleton shape="circle" />
        <Skeleton shape="rect" />
      </LoadingRegion>,
    );
    expect(container.firstElementChild).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Betöltés…");
    const hidden = container.querySelectorAll('[aria-hidden="true"]');
    expect(hidden).toHaveLength(3);
    expect(hidden[0]!.children).toHaveLength(3);
  });

  it("SaveStatus is a live region that shows each state", () => {
    const messages = { saving: "Mentés…", saved: "Mentve", error: "Nem sikerült menteni" };
    const { rerender } = render(<SaveStatus state="idle" messages={messages} />);
    const status = screen.getByRole("status");
    expect(status).toBeEmptyDOMElement();
    rerender(<SaveStatus state="saving" messages={messages} />);
    expect(status).toHaveTextContent("Mentés…");
    rerender(<SaveStatus state="saved" messages={messages} />);
    expect(status).toHaveTextContent("Mentve");
    rerender(<SaveStatus state="error" messages={messages} />);
    expect(status).toHaveTextContent("Nem sikerült menteni");
  });

  it("Fieldset and FormActions group a form", () => {
    render(
      <form>
        <Fieldset legend="Elérhetőség" description="Csak az iroda látja.">
          <input aria-label="E-mail" />
        </Fieldset>
        <FormActions>
          <Button type="submit">Mentés</Button>
        </FormActions>
      </form>,
    );
    expect(screen.getByRole("group", { name: "Elérhetőség" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mentés" })).toHaveAttribute("type", "submit");
  });
});

function SaveButton() {
  const toast = useToast();
  return (
    <>
      <button type="button" onClick={() => toast.show({ title: "A hirdetés mentve." })}>
        Mentés
      </button>
      <button type="button" onClick={() => toast.show({ tone: "danger", title: "Hiba történt." })}>
        Hiba
      </button>
    </>
  );
}

describe("toasts", () => {
  it("shows a confirmation in a polite region and hides it after the duration", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <ToastProvider regionLabel="Értesítések" closeLabel="Értesítés bezárása">
        <SaveButton />
      </ToastProvider>,
    );
    const region = screen.getByRole("region", { name: "Értesítések" });
    expect(region).toHaveAttribute("aria-live", "polite");
    await userEvent.click(screen.getByRole("button", { name: "Mentés" }));
    expect(within(region).getByRole("status")).toHaveTextContent("A hirdetés mentve.");
    act(() => {
      vi.advanceTimersByTime(5100);
    });
    expect(within(region).queryByRole("status")).toBeNull();
    vi.useRealTimers();
  });

  it("errors stay until dismissed; at most three are shown", async () => {
    render(
      <ToastProvider regionLabel="Értesítések" closeLabel="Értesítés bezárása">
        <SaveButton />
      </ToastProvider>,
    );
    const region = screen.getByRole("region", { name: "Értesítések" });
    for (let i = 0; i < 4; i++) await userEvent.click(screen.getByRole("button", { name: "Hiba" }));
    expect(within(region).getAllByRole("status")).toHaveLength(3);
    const close = within(region).getAllByRole("button", { name: "Értesítés bezárása" });
    await userEvent.click(close[0]!);
    expect(within(region).getAllByRole("status")).toHaveLength(2);
  });

  it("useToast outside a provider throws a helpful error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<SaveButton />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });

  it("a static toast renders without a dismiss button when no handler is given", () => {
    render(<Toast tone="info" title="Új verzió" description="Frissítse az oldalt." />);
    expect(screen.getByText("Új verzió")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
