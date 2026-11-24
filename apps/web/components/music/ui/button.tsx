import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { buttonClasses, cn, type ButtonSize, type ButtonVariant } from "@churchy/ui";

// Music Sheet DB's shadcn button, drawn by Churchy's design-system button classes
// (`buttonClasses()`): their variants and sizes map onto Churchy's; base-ui's primitive stays for
// its `render` prop (links that look like buttons).

type MusicVariant = "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
type MusicSize = "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";

const VARIANTS: Record<MusicVariant, ButtonVariant> = {
  default: "primary",
  outline: "outline",
  secondary: "secondary",
  ghost: "ghost",
  destructive: "destructive",
  link: "ghost",
};
const SIZES: Record<MusicSize, ButtonSize> = {
  default: "md",
  xs: "sm",
  sm: "sm",
  lg: "lg",
  icon: "md",
  "icon-xs": "sm",
  "icon-sm": "sm",
  "icon-lg": "lg",
};

export interface ButtonVariantProps {
  variant?: MusicVariant | null;
  size?: MusicSize | null;
  className?: string;
}

/** The classes of a button, e.g. for a link that looks like one. */
function buttonVariants({ variant, size, className }: ButtonVariantProps = {}) {
  const s = size ?? "default";
  return cn(
    buttonClasses({
      variant: VARIANTS[variant ?? "default"],
      size: SIZES[s],
      iconOnly: s.startsWith("icon"),
    }),
    variant === "link" && "underline-offset-4 hover:underline",
    className,
  );
}

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & ButtonVariantProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={buttonVariants({ variant, size, className: className as string | undefined })}
      {...props}
    />
  );
}

export { Button, buttonVariants };
