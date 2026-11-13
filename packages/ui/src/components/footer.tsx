import type { AnchorHTMLAttributes, ReactNode } from "react";
import { cn } from "../cn";
import { Container } from "./layout";
import { Ornament } from "../ornament";

export interface FooterColumn {
  heading: string;
  /** Free content: an `<address>`, a list of `FooterLink`s, opening hours … */
  children: ReactNode;
}

export interface FooterProps {
  brand: { name: string; description?: string };
  columns: FooterColumn[];
  /** Legal links (Impresszum, Adatkezelés …). */
  legal?: Array<{ label: string; href: string }>;
  /** Accessible name of the legal `<nav>`. Required when `legal` is given. */
  legalLabel?: string;
  /** Copyright / credit line. */
  note?: ReactNode;
}

/** Link with a 44 px tall hit area for use inside footer columns. */
export function FooterLink({
  href,
  children,
  className,
  ...rest
}: { href: string; children: ReactNode; className?: string } & Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href" | "children" | "className"
>) {
  return (
    <a
      href={href}
      className={cn(
        "inline-flex min-h-11 items-center text-inverse-text underline decoration-inverse-muted/60 underline-offset-4 hover:decoration-inverse-accent",
        className,
      )}
      {...rest}
    >
      {children}
    </a>
  );
}

/** Site footer (the `contentinfo` landmark) on the inverse surface. */
export function Footer({ brand, columns, legal, legalLabel, note }: FooterProps) {
  return (
    <footer
      data-surface="inverse"
      className="border-t-4 border-t-accent bg-inverse text-inverse-text"
    >
      <Container className="py-10 lg:py-14">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr] lg:gap-12">
          <div className="md:col-span-2 lg:col-span-1">
            <p className="font-heading text-fs-5 font-bold text-inverse-accent">{brand.name}</p>
            <Ornament className="mt-3 text-inverse-accent" />
            {brand.description ? (
              <p className="mt-4 max-w-[40ch] text-fs-2 text-inverse-muted">{brand.description}</p>
            ) : null}
          </div>
          {columns.map((column) => (
            <div key={column.heading} className="text-fs-2 text-inverse-text">
              <h2 className="mb-3 font-body text-fs-1 font-bold tracking-[0.14em] text-inverse-accent uppercase">
                {column.heading}
              </h2>
              {column.children}
            </div>
          ))}
        </div>

        {legal?.length || note ? (
          <div className="mt-10 flex flex-col gap-3 border-t border-inverse-muted/30 pt-5 text-fs-2 text-inverse-muted lg:flex-row lg:items-center lg:justify-between">
            {legal?.length ? (
              <nav aria-label={legalLabel}>
                <ul className="-mx-1 flex flex-wrap gap-x-4">
                  {legal.map((item) => (
                    <li key={item.href}>
                      <FooterLink href={item.href} className="px-1">
                        {item.label}
                      </FooterLink>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}
            {note ? <p>{note}</p> : null}
          </div>
        ) : null}
      </Container>
    </footer>
  );
}
