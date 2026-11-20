import type { SVGProps } from "react";
import type { SocialNetwork } from "@/lib/footer";

/**
 * Inline social-network glyphs for the footer (D-17): drawn here, so no third-party script, font
 * or image is ever loaded. Decorative (`aria-hidden`); the link around them carries the name.
 */
type IconProps = SVGProps<SVGSVGElement>;

function Glyph(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    />
  );
}

const FacebookIcon = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M13.5 21v-7.5H16l.4-3H13.5V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H8v3h2.5V21h3z" />
  </Glyph>
);

const YoutubeIcon = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8c1.6.4 7.8.4 7.8.4s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8zM10 15V9l5.2 3L10 15z" />
  </Glyph>
);

const InstagramIcon = (p: IconProps) => (
  <Glyph {...p} fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none" />
  </Glyph>
);

export const SOCIAL_ICONS: Record<SocialNetwork, (p: IconProps) => React.JSX.Element> = {
  facebook: FacebookIcon,
  youtube: YoutubeIcon,
  instagram: InstagramIcon,
};
