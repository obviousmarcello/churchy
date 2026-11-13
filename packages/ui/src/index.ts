// @churchy/ui: accessible core components. All user-visible text arrives via props.
export { cn } from "./cn";
export { Ornament } from "./ornament";
export { AdminScope, usePortalContainer, type AdminScopeProps } from "./components/scope";
export {
  Container,
  PageShell,
  SkipLink,
  type PageShellProps,
  type SkipLinkProps,
} from "./components/layout";
export { Header, type HeaderProps, type NavItem } from "./components/header";
export { Footer, FooterLink, type FooterColumn, type FooterProps } from "./components/footer";
export { Hero, type HeroImage, type HeroProps } from "./components/hero";
export { Card, type CardImage, type CardProps } from "./components/card";
export { SectionHeading, type SectionHeadingProps } from "./components/section-heading";
export {
  Button,
  ButtonLink,
  buttonClasses,
  type ButtonLinkProps,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
} from "./components/button";
export {
  Checkbox,
  DateInput,
  Input,
  Select,
  Textarea,
  TimeInput,
  type CheckboxProps,
  type FieldProps,
  type InputProps,
  type SelectOption,
  type SelectProps,
  type TextareaProps,
} from "./components/fields";
export { Badge, type BadgeProps, type BadgeTone } from "./components/badge";
export { Alert, type AlertProps, type AlertTone } from "./components/alert";
export { Tabs, type TabItem, type TabsProps } from "./components/tabs";
export { Dialog, DialogClose, type DialogProps } from "./components/dialog";
