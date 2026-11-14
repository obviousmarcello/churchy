import type { CSSProperties } from "react";
import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";

/**
 * Shared layout of every notification email. Mail clients ignore CSS variables and external
 * stylesheets, so the (Klasszikus) palette is inlined here; all pairs meet WCAG AA contrast.
 */
const color = {
  page: "#f4f1ec",
  card: "#ffffff",
  text: "#241c1c",
  muted: "#5c5149",
  border: "#ddd5c9",
  primary: "#6e1f2e",
  onPrimary: "#ffffff",
} as const;

const styles = {
  body: {
    backgroundColor: color.page,
    color: color.text,
    fontFamily: "'Source Sans 3', Helvetica, Arial, sans-serif",
    margin: 0,
    padding: "24px 12px",
  },
  card: {
    backgroundColor: color.card,
    border: `1px solid ${color.border}`,
    borderRadius: "6px",
    maxWidth: "560px",
    padding: "32px 28px",
  },
  brand: {
    color: color.muted,
    fontSize: "13px",
    letterSpacing: "0.12em",
    margin: "0 0 20px",
    textTransform: "uppercase",
  },
  heading: {
    color: color.text,
    fontFamily: "'Cormorant Garamond', Georgia, 'Times New Roman', serif",
    fontSize: "28px",
    fontWeight: 600,
    lineHeight: "34px",
    margin: "0 0 16px",
  },
  paragraph: { color: color.text, fontSize: "17px", lineHeight: "26px", margin: "0 0 16px" },
  factLabel: {
    color: color.muted,
    fontSize: "15px",
    lineHeight: "22px",
    padding: "4px 12px 4px 0",
  },
  factValue: { color: color.text, fontSize: "15px", fontWeight: 600, padding: "4px 0" },
  button: {
    backgroundColor: color.primary,
    borderRadius: "6px",
    color: color.onPrimary,
    display: "inline-block",
    fontSize: "17px",
    fontWeight: 600,
    padding: "12px 24px",
    textDecoration: "none",
  },
  fallback: { color: color.muted, fontSize: "14px", lineHeight: "21px", margin: "20px 0 0" },
  rule: { borderColor: color.border, margin: "28px 0 16px" },
  footer: { color: color.muted, fontSize: "13px", lineHeight: "20px", margin: "0 0 4px" },
} satisfies Record<string, CSSProperties>;

export interface Fact {
  label: string;
  value: string;
}

export interface EmailFrameProps {
  /** `<html lang>` — the product is Hungarian only. */
  lang?: string;
  brand: string;
  preheader: string;
  heading: string;
  paragraphs: readonly string[];
  facts?: readonly Fact[];
  /** Call to action; rendered only when there is a link. */
  action?: { label: string; url: string } | null;
  linkFallbackLabel: string;
  churchLabel: string;
  churchName: string;
  footerNotice: string;
}

export function EmailFrame({
  lang = "hu",
  brand,
  preheader,
  heading,
  paragraphs,
  facts = [],
  action = null,
  linkFallbackLabel,
  churchLabel,
  churchName,
  footerNotice,
}: EmailFrameProps) {
  return (
    <Html lang={lang}>
      <Head />
      <Preview>{preheader}</Preview>
      <Body style={styles.body}>
        <Container style={styles.card}>
          <Text style={styles.brand}>{brand}</Text>
          <Heading as="h1" style={styles.heading}>
            {heading}
          </Heading>
          {paragraphs.map((paragraph) => (
            <Text key={paragraph} style={styles.paragraph}>
              {paragraph}
            </Text>
          ))}
          {facts.length > 0 ? (
            <Section style={{ margin: "0 0 20px" }}>
              {facts.map((fact) => (
                <Row key={fact.label}>
                  <Column style={styles.factLabel}>{fact.label}</Column>
                  <Column style={styles.factValue}>{fact.value}</Column>
                </Row>
              ))}
            </Section>
          ) : null}
          {action ? (
            <>
              <Section style={{ margin: "8px 0 0" }}>
                <Button href={action.url} style={styles.button}>
                  {action.label}
                </Button>
              </Section>
              <Text style={styles.fallback}>
                {linkFallbackLabel} {action.url}
              </Text>
            </>
          ) : null}
          <Hr style={styles.rule} />
          <Text style={styles.footer}>
            {churchLabel}: {churchName}
          </Text>
          <Text style={styles.footer}>{footerNotice}</Text>
        </Container>
      </Body>
    </Html>
  );
}
