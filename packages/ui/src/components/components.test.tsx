import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  AdminScope,
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  Checkbox,
  DateInput,
  Dialog,
  DialogClose,
  Footer,
  FooterLink,
  Header,
  Hero,
  Input,
  PageShell,
  SectionHeading,
  Select,
  Tabs,
  Textarea,
  TimeInput,
} from "../index";

const image = { src: "/x.jpg", alt: "A church", width: 1600, height: 900 };

describe("PageShell and SkipLink", () => {
  it("renders skip link first, then landmarks", () => {
    render(
      <PageShell skipLinkLabel="Skip" header={<header>H</header>} footer={<footer>F</footer>}>
        <p>Body</p>
      </PageShell>,
    );
    const skip = screen.getByRole("link", { name: "Skip" });
    expect(skip).toHaveAttribute("href", "#tartalom");
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "tartalom");
    expect(main).toHaveAttribute("tabindex", "-1");
    expect(skip.parentElement?.firstElementChild).toBe(skip);
  });
});

describe("Button", () => {
  it("defaults to type=button and applies variant/size classes", () => {
    render(
      <Button variant="danger" size="lg" fullWidth>
        Delete
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Delete" });
    expect(button).toHaveAttribute("type", "button");
    expect(button.className).toContain("bg-danger");
    expect(button.className).toContain("min-h-(--control-h-lg)");
    expect(button.className).toContain("w-full");
  });

  it("fires onClick and honours disabled", async () => {
    const onClick = vi.fn();
    render(
      <>
        <Button onClick={onClick}>On</Button>
        <Button onClick={onClick} disabled>
          Off
        </Button>
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "On" }));
    await userEvent.click(screen.getByRole("button", { name: "Off" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("ButtonLink is a real link", () => {
    render(
      <ButtonLink href="/x" variant="secondary" iconEnd={<i data-testid="icon" />}>
        Go
      </ButtonLink>,
    );
    expect(screen.getByRole("link", { name: "Go" })).toHaveAttribute("href", "/x");
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });
});

describe("Header", () => {
  const props = {
    brand: { name: "Parish", href: "/" },
    nav: [
      { label: "Home", href: "/", current: true },
      { label: "Schedule", href: "/schedule" },
      {
        label: "About",
        href: "/about",
        children: [
          { label: "History", href: "/about/history" },
          { label: "Staff", href: "/about/staff", current: true },
        ],
      },
    ],
    cta: { label: "Give", href: "/give" },
    labels: { navigation: "Main", openMenu: "Open menu", closeMenu: "Close menu" },
  };

  it("exposes a labelled nav and marks the current page", () => {
    render(<Header {...props} />);
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Parish" })).toHaveAttribute("href", "/");
  });

  it("toggles the mobile menu with aria-expanded and a changing label", async () => {
    render(<Header {...props} />);
    const toggle = screen.getByRole("button", { name: "Open menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const nav = screen.getByRole("navigation", { name: "Main", hidden: true });
    expect(toggle).toHaveAttribute("aria-controls", nav.id);
    expect(nav.className).toContain("hidden");

    await userEvent.click(toggle);
    const open = screen.getByRole("button", { name: "Close menu" });
    expect(open).toHaveAttribute("aria-expanded", "true");
    expect(nav.className).toContain("block");
  });

  it("closes on Escape and returns focus to the toggle", async () => {
    render(<Header {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    await userEvent.tab(); // moves into the menu
    await userEvent.keyboard("{Escape}");
    const toggle = screen.getByRole("button", { name: "Open menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
  });

  it("closes when focus leaves the header and when a link is followed", async () => {
    render(
      <>
        <Header {...props} />
        <button>Outside</button>
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    await userEvent.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    await userEvent.click(screen.getByRole("link", { name: "Schedule" }));
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("opens a submenu disclosure and closes it with Escape, restoring focus", async () => {
    render(<Header {...props} />);
    const about = screen.getByRole("button", { name: "About" });
    expect(about).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(about);
    expect(about).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Staff" })).toHaveAttribute("aria-current", "page");
    await userEvent.keyboard("{Escape}");
    expect(about).toHaveAttribute("aria-expanded", "false");
    expect(about).toHaveFocus();
  });

  it("closes the open submenu on an outside pointer press", async () => {
    render(
      <>
        <Header {...props} />
        <p>Elsewhere</p>
      </>,
    );
    const about = screen.getByRole("button", { name: "About" });
    await userEvent.click(about);
    await userEvent.click(screen.getByText("Elsewhere"));
    expect(about).toHaveAttribute("aria-expanded", "false");
  });

  it("renders without a CTA and with a logo", () => {
    render(
      <Header
        {...props}
        cta={undefined}
        brand={{ ...props.brand, logo: <i data-testid="logo" /> }}
      />,
    );
    expect(screen.queryByRole("link", { name: "Give", hidden: true })).toBeNull();
    expect(screen.getByTestId("logo")).toBeInTheDocument();
  });
});

describe("Footer", () => {
  it("renders the contentinfo landmark with columns and a labelled legal nav", () => {
    render(
      <Footer
        brand={{ name: "Parish", description: "Desc" }}
        columns={[{ heading: "Contact", children: <FooterLink href="tel:1">Call</FooterLink> }]}
        legal={[{ label: "Privacy", href: "/privacy" }]}
        legalLabel="Legal"
        note="(c) 2026"
      />,
    );
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Contact" })).toBeInTheDocument();
    expect(
      within(screen.getByRole("navigation", { name: "Legal" })).getByRole("link", {
        name: "Privacy",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("(c) 2026")).toBeInTheDocument();
  });

  it("omits the legal row when there is nothing to show", () => {
    render(<Footer brand={{ name: "P" }} columns={[]} />);
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});

describe("Hero", () => {
  it.each(["image-full", "image-split"] as const)(
    "%s renders the image with alt text",
    (variant) => {
      const { container } = render(
        <Hero
          variant={variant}
          title="Welcome"
          lead="Lead"
          eyebrow="Eyebrow"
          image={image}
          actions={<a href="#">Act</a>}
        />,
      );
      expect(screen.getByRole("heading", { level: 1, name: "Welcome" })).toBeInTheDocument();
      expect(screen.getByRole("img", { name: "A church" })).toHaveAttribute("width", "1600");
      expect(container.querySelector(`[data-hero="${variant}"]`)).not.toBeNull();
      expect(screen.getByText("Lead")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Act" })).toBeInTheDocument();
    },
  );

  it("text-only has no image and supports h2", () => {
    const { container } = render(<Hero variant="text-only" title="T" headingLevel={2} />);
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[data-hero="text-only"]')).not.toBeNull();
  });

  it("falls back to text-only when an image variant has no image", () => {
    const { container } = render(<Hero variant="image-full" title="T" />);
    expect(container.querySelector('[data-hero="text-only"]')).not.toBeNull();
  });
});

describe("Card and SectionHeading", () => {
  it("makes the whole card a link through the title", () => {
    render(
      <Card
        title="News"
        href="/news"
        eyebrow="Hír"
        image={{ src: "/a.jpg", alt: "" }}
        footer={<span>Date</span>}
      >
        Body
      </Card>,
    );
    expect(screen.getByRole("link", { name: "News" })).toHaveAttribute("href", "/news");
    expect(screen.getByRole("heading", { level: 3, name: "News" })).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
  });

  it("renders a plain highlight card with a custom heading level and element", () => {
    const { container } = render(<Card title="Alert" tone="highlight" headingLevel={2} as="div" />);
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(container.firstElementChild?.tagName).toBe("DIV");
  });

  it("SectionHeading renders level, eyebrow and action", () => {
    render(
      <SectionHeading
        title="Hírek"
        level={3}
        eyebrow="Eyebrow"
        action={<a href="/all">All</a>}
        align="center"
        id="h"
      />,
    );
    expect(screen.getByRole("heading", { level: 3, name: "Hírek" })).toHaveAttribute("id", "h");
    expect(screen.getByText("Eyebrow")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All" })).toBeInTheDocument();
  });
});

describe("form controls", () => {
  it("Input links label, help and error and sets aria-invalid", () => {
    render(<Input label="Email" help="Help text" error="Bad email" />);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    const describedBy = input.getAttribute("aria-describedby")!.split(" ");
    expect(describedBy).toHaveLength(2);
    expect(document.getElementById(describedBy[0]!)).toHaveTextContent("Bad email");
    expect(document.getElementById(describedBy[1]!)).toHaveTextContent("Help text");
  });

  it("Input without messages has no aria-describedby/invalid", () => {
    render(<Input label="Name" optionalLabel="(optional)" />);
    const input = screen.getByLabelText(/Name/);
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
    expect(screen.getByText("(optional)")).toBeInTheDocument();
  });

  it("does not show the optional hint on required fields", () => {
    render(<Input label="Name" optionalLabel="(optional)" required />);
    expect(screen.queryByText("(optional)")).toBeNull();
    expect(screen.getByLabelText("Name")).toBeRequired();
  });

  it("types in an Input, supports date and time", async () => {
    render(
      <>
        <Input label="Name" />
        <DateInput label="Date" defaultValue="2026-11-15" />
        <TimeInput label="Time" defaultValue="18:00" />
      </>,
    );
    await userEvent.type(screen.getByLabelText("Name"), "Anna");
    expect(screen.getByLabelText("Name")).toHaveValue("Anna");
    expect(screen.getByLabelText("Date")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("Date")).toHaveValue("2026-11-15");
    expect(screen.getByLabelText("Time")).toHaveAttribute("type", "time");
  });

  it("Textarea uses the label and rows", () => {
    render(<Textarea label="Message" help="Short" rows={3} />);
    const textarea = screen.getByLabelText("Message");
    expect(textarea).toHaveAttribute("rows", "3");
    expect(textarea).toHaveAccessibleDescription("Short");
  });

  it("Select renders options and a placeholder", async () => {
    render(
      <Select
        label="Church"
        placeholder="Choose"
        defaultValue=""
        error="Pick one"
        options={[
          { value: "a", label: "Alpha" },
          { value: "b", label: "Beta", disabled: true },
        ]}
      />,
    );
    const select = screen.getByLabelText("Church");
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(within(select).getAllByRole("option")).toHaveLength(3);
    await userEvent.selectOptions(select, "a");
    expect(select).toHaveValue("a");
  });

  it("Select with a required placeholder disables the empty option", () => {
    render(
      <Select label="X" placeholder="Choose" required options={[{ value: "a", label: "A" }]} />,
    );
    expect(screen.getByRole("option", { name: "Choose" })).toBeDisabled();
  });

  it("Checkbox toggles through its label and links messages", async () => {
    const onChange = vi.fn();
    render(<Checkbox label="Accept" help="Why" error="Required" onChange={onChange} />);
    const box = screen.getByRole("checkbox", { name: "Accept" });
    await userEvent.click(screen.getByText("Accept"));
    expect(box).toBeChecked();
    expect(onChange).toHaveBeenCalled();
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(box).toHaveAccessibleDescription("Required Why");
  });

  it("Checkbox accepts rich label content", () => {
    render(
      <Checkbox
        label="Accept"
        labelContent={
          <span>
            Accept <a href="/p">policy</a>
          </span>
        }
      />,
    );
    expect(screen.getByRole("link", { name: "policy" })).toBeInTheDocument();
  });
});

describe("Badge and Alert", () => {
  it("Badge shows its text and tone", () => {
    render(
      <Badge tone="danger" dot>
        Live
      </Badge>,
    );
    expect(screen.getByText("Live").className).toContain("text-danger");
  });

  it("Alert is a plain region unless a live role is requested", () => {
    const { rerender } = render(<Alert title="Note">Body</Alert>);
    expect(screen.queryByRole("alert")).toBeNull();
    rerender(
      <Alert
        tone="danger"
        role="alert"
        variant="banner"
        title="Oops"
        action={<button>Retry</button>}
      >
        Body
      </Alert>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Oops");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it.each(["info", "success", "warning", "danger"] as const)("Alert %s renders an icon", (tone) => {
    const { container } = render(<Alert tone={tone}>Text</Alert>);
    expect(container.querySelector("svg[aria-hidden='true']")).not.toBeNull();
  });
});

describe("Tabs", () => {
  const tabs = [
    { value: "a", label: "First", content: <p>Panel A</p> },
    { value: "b", label: "Second", content: <p>Panel B</p> },
  ];

  it("shows the first panel and switches with the arrow keys", async () => {
    render(<Tabs label="Sections" tabs={tabs} />);
    expect(screen.getByRole("tablist", { name: "Sections" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "First" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Panel A")).toBeVisible();
    await userEvent.tab();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Second" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Panel B")).toBeVisible();
  });

  it("supports a controlled value", async () => {
    const onValueChange = vi.fn();
    render(<Tabs label="Sections" tabs={tabs} value="b" onValueChange={onValueChange} />);
    expect(screen.getByText("Panel B")).toBeVisible();
    await userEvent.click(screen.getByRole("tab", { name: "First" }));
    expect(onValueChange).toHaveBeenCalledWith("a");
  });
});

describe("Dialog", () => {
  it("opens from the trigger, is labelled by title and description, closes with Escape and restores focus", async () => {
    render(
      <Dialog
        trigger={<button>Open</button>}
        title="Sure?"
        description="This cannot be undone."
        closeLabel="Close"
        footer={
          <DialogClose asChild>
            <button>Cancel</button>
          </DialogClose>
        }
      >
        <p>Details</p>
      </Dialog>,
    );
    const trigger = screen.getByRole("button", { name: "Open" });
    await userEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Sure?" });
    expect(dialog).toHaveAccessibleDescription("This cannot be undone.");
    expect(within(dialog).getByText("Details")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("closes with the labelled close button and the footer action", async () => {
    render(
      <Dialog
        trigger={<button>Open</button>}
        title="T"
        closeLabel="Close"
        footer={
          <DialogClose asChild>
            <button>Cancel</button>
          </DialogClose>
        }
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("can be controlled", async () => {
    const onOpenChange = vi.fn();
    render(<Dialog open title="Controlled" closeLabel="Close" onOpenChange={onOpenChange} />);
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("portals into the AdminScope so it keeps the admin variant", async () => {
    render(
      <AdminScope data-testid="scope">
        <Dialog trigger={<button>Open</button>} title="In scope" closeLabel="Close" />
      </AdminScope>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(within(screen.getByTestId("scope")).getByRole("dialog")).toBeInTheDocument();
  });
});

describe("AdminScope", () => {
  it("marks the subtree as the admin variant", () => {
    render(
      <AdminScope data-testid="scope" className="extra">
        x
      </AdminScope>,
    );
    const scope = screen.getByTestId("scope");
    expect(scope).toHaveAttribute("data-ui", "admin");
    expect(scope).toHaveClass("extra");
  });
});
