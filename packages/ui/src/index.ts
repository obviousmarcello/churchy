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
export { Card, type CardImage, type CardProps, type CardVariant } from "./components/card";
export { SectionHeading, type SectionHeadingProps } from "./components/section-heading";
export {
  Button,
  ButtonLink,
  IconButton,
  buttonClasses,
  type ButtonClassOptions,
  type ButtonLinkProps,
  type IconButtonProps,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
} from "./components/button";
export {
  Checkbox,
  DateInput,
  Fieldset,
  FormActions,
  Input,
  Select,
  Textarea,
  TimeInput,
  type CheckboxProps,
  type FieldProps,
  type FieldsetProps,
  type InputProps,
  type SelectOption,
  type SelectProps,
  type TextareaProps,
} from "./components/fields";
export {
  Badge,
  StatusPill,
  type BadgeProps,
  type BadgeTone,
  type StatusPillProps,
  type StatusTone,
} from "./components/badge";
export { Alert, type AlertProps, type AlertTone } from "./components/alert";
export { Tabs, type TabItem, type TabsProps } from "./components/tabs";
export {
  Breadcrumbs,
  NavTabs,
  PageHeader,
  type BreadcrumbItem,
  type BreadcrumbsProps,
  type NavTabItem,
  type NavTabsProps,
  type PageHeaderProps,
} from "./components/navigation";
export {
  DataTable,
  RowActions,
  type DataTableColumn,
  type DataTableProps,
} from "./components/table";
export {
  EmptyState,
  LoadingRegion,
  SaveStatus,
  Skeleton,
  type EmptyStateProps,
  type LoadingRegionProps,
  type SaveState,
  type SaveStatusProps,
  type SkeletonProps,
} from "./components/feedback";
export {
  Toast,
  ToastProvider,
  useToast,
  type ToastOptions,
  type ToastProps,
  type ToastProviderProps,
  type ToastTone,
} from "./components/toast";
export { Dialog, DialogClose, type DialogProps } from "./components/dialog";
export {
  Address,
  BankAccount,
  FormattedDate,
  FormattedTime,
  PersonName,
  Phone,
  type AddressProps,
  type BankAccountProps,
  type FormattedDateProps,
  type FormattedDateStyle,
  type FormattedTimeProps,
  type PersonNameProps,
  type PhoneProps,
} from "./components/formatted";
export {
  RichTextContent,
  safeHref,
  safeImageSrc,
  type RichTextContentProps,
  type RichTextEmbedLabels,
} from "./components/rich-text";
export {
  RichTextEditor,
  type RichTextDoc,
  type RichTextEditorImage,
  type RichTextEditorLabels,
  type RichTextEditorProps,
} from "./components/rich-text-editor";
export {
  MediaLibrary,
  MediaPicker,
  type MediaItem,
  type MediaLibraryLabels,
  type MediaLibraryProps,
  type MediaPickerProps,
  type MediaUploadInput,
} from "./components/media-library";
export {
  PageBlocks,
  type BlockFile,
  type BlockImage,
  type PageBlocksLabels,
  type PageBlocksProps,
} from "./components/page-blocks";
export { embedSource, type AllowedEmbedProvider, type EmbedSource } from "./components/embed";
export { EmbedFacade, type EmbedFacadeProps } from "./components/embed-facade";
export { decodeEmail, encodeEmail, spokenEmail } from "./components/email-obfuscation";
export { ObfuscatedEmail, type ObfuscatedEmailProps } from "./components/obfuscated-email";
export * from "./icons/index";
