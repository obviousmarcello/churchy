import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  AnimatedNumber,
  Avatar,
  Button,
  Card,
  Chip,
  Dialog,
  Disclosure,
  IconTile,
  MenuItem,
  NavTabs,
  PageHeader,
  PageTransition,
  Popover,
  Progress,
  Radio,
  Reveal,
  SegmentedControl,
  SideNav,
  Stagger,
  Tabs,
  pageTransitionTypes,
  PAGE_TRANSITION_TYPE,
} from "../index";
import { CalendarIcon } from "../icons";

describe("design v2 primitives", () => {
  it("IconTile is a decorative rounded tile", () => {
    const { container } = render(<IconTile icon={<CalendarIcon />} tone="success" />);
    const tile = container.firstElementChild!;
    expect(tile).toHaveAttribute("aria-hidden", "true");
    expect(tile.className).toContain("rounded-tile");
    expect(tile).toHaveAttribute("data-icon-tile", "success");
  });

  it("Avatar is named when labelled and decorative otherwise", () => {
    const { rerender } = render(<Avatar label="Kovács Anna" initials="KA" />);
    expect(screen.getByRole("img", { name: "Kovács Anna" })).toBeInTheDocument();
    rerender(<Avatar initials="KA" />);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("Chip renders a span, a link or a toggle button", () => {
    const { rerender } = render(<Chip>Liturgia</Chip>);
    expect(screen.getByText("Liturgia").tagName).toBe("SPAN");
    rerender(
      <Chip href="/x" current>
        Liturgia
      </Chip>,
    );
    expect(screen.getByRole("link", { name: "Liturgia" })).toHaveAttribute("aria-current", "page");
    rerender(
      <Chip onClick={() => undefined} selected>
        Liturgia
      </Chip>,
    );
    expect(screen.getByRole("button", { name: "Liturgia" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("Reveal and Stagger only add data attributes (CSS does the motion)", () => {
    const { container } = render(
      <>
        <Reveal delay={120}>a</Reveal>
        <Stagger as="ul">
          <li>1</li>
          <li>2</li>
        </Stagger>
      </>,
    );
    const reveal = container.querySelector("[data-reveal]") as HTMLElement;
    expect(reveal.style.getPropertyValue("--reveal-delay")).toBe("120ms");
    expect(container.querySelector("ul[data-stagger]")?.children).toHaveLength(2);
  });

  it("Progress exposes its value and label", () => {
    render(<Progress label="Feltöltés" value={3} max={5} valueText="3 / 5" />);
    const bar = screen.getByRole("progressbar", { name: "Feltöltés" });
    expect(bar).toHaveAttribute("aria-valuenow", "3");
    expect(bar).toHaveAttribute("aria-valuetext", "3 / 5");
  });
});

describe("SegmentedControl", () => {
  it("is a named radio group that works with the keyboard", async () => {
    const user = userEvent.setup();
    render(
      <SegmentedControl
        label="Nézet"
        name="view"
        defaultValue="week"
        options={[
          { value: "day", label: "Nap" },
          { value: "week", label: "Hét" },
          { value: "month", label: "Hónap" },
        ]}
      />,
    );
    const group = screen.getByRole("radiogroup", { name: "Nézet" });
    expect(group).toHaveAttribute("data-segmented");
    expect(screen.getByRole("radio", { name: "Hét" })).toBeChecked();
    await user.click(screen.getByText("Hónap"));
    expect(screen.getByRole("radio", { name: "Hónap" })).toBeChecked();
  });

  it("reports changes when controlled", () => {
    const changes: string[] = [];
    render(
      <SegmentedControl
        label="Nézet"
        name="view"
        value="day"
        onValueChange={(v) => changes.push(v)}
        options={[
          { value: "day", label: "Nap" },
          { value: "week", label: "Hét" },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Hét" }));
    expect(changes).toEqual(["week"]);
  });
});

describe("overlays and navigation", () => {
  it("Popover wires a native popover to its trigger", () => {
    render(
      <Popover triggerLabel="Műveletek" label="Hirdetés műveletei">
        <MenuItem>Szerkesztés</MenuItem>
      </Popover>,
    );
    const trigger = screen.getByRole("button", { name: "Műveletek" });
    const id = trigger.getAttribute("popovertarget");
    expect(id).toBeTruthy();
    const panel = document.getElementById(id!)!;
    expect(panel).toHaveAttribute("popover", "auto");
    expect(panel).toHaveAttribute("data-ui-popover");
    expect(panel).toHaveAttribute("aria-label", "Hirdetés műveletei");
  });

  it("Disclosure is a details element with an animated content hook", () => {
    const { container } = render(<Disclosure summary="Kérdés">Válasz</Disclosure>);
    const details = container.querySelector("details")!;
    expect(details).toHaveAttribute("data-disclosure");
    expect(details.querySelector("summary")).toHaveTextContent("Kérdés");
  });

  it("SideNav marks the current item and can name its view transition", () => {
    render(
      <SideNav
        label="Munkatér"
        transitionName="ws-nav"
        items={[
          { label: "Ma", href: "/a", current: true },
          { label: "Naptár", href: "/b", count: 2 },
        ]}
      />,
    );
    const current = screen.getByRole("link", { name: "Ma" });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current.style.viewTransitionName).toBe("ws-nav");
    expect(screen.getByRole("link", { name: /Naptár/ })).not.toHaveAttribute("aria-current");
  });

  it("NavTabs draws the thumb on the current tab", () => {
    render(
      <NavTabs
        label="Részek"
        items={[
          { label: "Tartalom", href: "/a", current: true },
          { label: "Képek", href: "/b" },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "Tartalom" }).className).toContain("shadow-card");
    expect(screen.getByRole("link", { name: "Képek" }).className).not.toContain("shadow-card");
  });

  it("Tabs keeps Radix semantics with the sliding indicator", async () => {
    const user = userEvent.setup();
    render(
      <Tabs
        label="Hely"
        tabs={[
          { value: "a", label: "Egy", content: "első" },
          { value: "b", label: "Kettő", content: "második" },
        ]}
      />,
    );
    await user.click(screen.getByRole("tab", { name: "Kettő" }));
    expect(screen.getByRole("tab", { name: "Kettő" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("második");
  });

  it("Dialog opens as a drawer with placement=end", async () => {
    const user = userEvent.setup();
    render(
      <Dialog placement="end" title="Szűrők" closeLabel="Bezárás" trigger={<Button>Nyitás</Button>}>
        tartalom
      </Dialog>,
    );
    await user.click(screen.getByRole("button", { name: "Nyitás" }));
    expect(screen.getByRole("dialog", { name: "Szűrők" })).toHaveAttribute("data-placement", "end");
  });

  it("PageHeader shows an icon tile and Card variants include tinted", () => {
    const { container } = render(
      <>
        <PageHeader title="Kérések" icon={<CalendarIcon />} />
        <Card variant="tinted" title="Panel" />
      </>,
    );
    expect(container.querySelector("[data-icon-tile]")).not.toBeNull();
    expect(container.querySelector('[data-card="tinted"]')?.className).toContain("bg-surface-tint");
  });

  it("Radio is a labelled native radio", () => {
    render(<Radio name="n" label="E-mailben" defaultChecked />);
    expect(screen.getByRole("radio", { name: "E-mailben" })).toBeChecked();
  });
});

describe("motion helpers", () => {
  it("Button keeps a loading slot when `loading` is a boolean, so the spinner can morph in", () => {
    const { container, rerender } = render(<Button loading={false}>Mentés</Button>);
    expect(container.querySelector('[data-slot="loading"]')).not.toBeNull();
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-busy");
    rerender(<Button loading>Mentés</Button>);
    expect(screen.getByRole("button", { name: "Mentés" })).toHaveAttribute("aria-busy", "true");
    rerender(<Button>Mentés</Button>);
    expect(container.querySelector('[data-slot="loading"]')).toBeNull();
  });

  it("AnimatedNumber shows the final value first and announces only the final value", () => {
    const { container, rerender } = render(<AnimatedNumber value={1200} />);
    expect(container.querySelector(".sr-only")?.textContent).toMatch(/1\s?200/);
    act(() => rerender(<AnimatedNumber value={1500} duration={0} />));
    expect(container.querySelector(".sr-only")?.textContent).toMatch(/1\s?500/);
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toMatch(/1\s?500/);
  });

  it("PageTransition renders its children and exports the navigation type", () => {
    render(
      <PageTransition>
        <p>oldal</p>
      </PageTransition>,
    );
    expect(screen.getByText("oldal")).toBeInTheDocument();
    expect(pageTransitionTypes).toEqual([PAGE_TRANSITION_TYPE]);
  });
});
