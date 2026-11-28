import type { ReactNode, SVGProps } from "react";

/**
 * Inline SVG icon set (24 x 24 grid, 1.75 px stroke, `currentColor`).
 *
 * Icons are decorative by default (`aria-hidden`): the meaning is carried by visible text or by the
 * accessible name of the control around them. Pass `title` only for a standalone icon that carries
 * meaning on its own; it then becomes `role="img"` with that name. All text arrives via props.
 *
 * ```tsx
 * <CalendarIcon />                  // 20 px, inherits the text colour
 * <CalendarIcon size="lg" />        // 24 px
 * <WarningIcon title={t("late")} /> // meaningful on its own
 * ```
 */
export type IconSize = "xs" | "sm" | "md" | "lg" | number;

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  /** `xs` 14, `sm` 16, `md` 20 (default), `lg` 24, or a pixel number. */
  size?: IconSize;
  /** Accessible name; only for an icon that carries meaning without visible text. */
  title?: string;
}

const SIZES: Record<Exclude<IconSize, number>, number> = { xs: 14, sm: 16, md: 20, lg: 24 };

function iconPixels(size: IconSize): number {
  return typeof size === "number" ? size : SIZES[size];
}

function Svg({ size = "md", title, children, ...props }: IconProps & { children: ReactNode }) {
  const px = iconPixels(size);
  const a11y = title
    ? { role: "img" as const, "aria-label": title }
    : { "aria-hidden": true as const, focusable: "false" as const };
  return (
    <svg
      viewBox="0 0 24 24"
      width={px}
      height={px}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      data-icon=""
      {...a11y}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

type IconComponent = (props: IconProps) => ReactNode;

function icon(paths: ReactNode, extra?: Partial<IconProps>): IconComponent {
  const Component = (props: IconProps) => (
    <Svg {...extra} {...props}>
      {paths}
    </Svg>
  );
  return Component;
}

/* Navigation */
export const MenuIcon = icon(<path d="M4 7h16M4 12h16M4 17h16" />);
export const CloseIcon = icon(<path d="M6 6l12 12M18 6L6 18" />);
export const ChevronDownIcon = icon(<path d="M6 9l6 6 6-6" />);
export const ChevronUpIcon = icon(<path d="M6 15l6-6 6 6" />);
export const ChevronLeftIcon = icon(<path d="M15 6l-6 6 6 6" />);
export const ChevronRightIcon = icon(<path d="M9 6l6 6-6 6" />);
export const ArrowRightIcon = icon(<path d="M5 12h14M13 6l6 6-6 6" />);
export const ArrowLeftIcon = icon(<path d="M19 12H5M11 6l-6 6 6 6" />);
export const ExternalLinkIcon = icon(
  <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />,
);
export const HomeIcon = icon(<path d="M4 11l8-7 8 7M6 9.5V20h4.5v-5.5h3V20H18V9.5" />);
export const DashboardIcon = icon(
  <>
    <rect x="4" y="4" width="7" height="8" rx="1" />
    <rect x="13" y="4" width="7" height="5" rx="1" />
    <rect x="13" y="11" width="7" height="9" rx="1" />
    <rect x="4" y="14" width="7" height="6" rx="1" />
  </>,
);
export const SearchIcon = icon(
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4 4" />
  </>,
);
export const GlobeIcon = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.3 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.3-3.5-8.5S9.6 5.9 12 3.5z" />
  </>,
);
export const LogOutIcon = icon(
  <path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 16l-4-4 4-4M6 12h10" />,
);

/* Actions */
export const PlusIcon = icon(<path d="M12 5v14M5 12h14" />);
export const EditIcon = icon(<path d="M4 20h4L19 9a2.1 2.1 0 00-3-3L5 17v3zM14 8l3 3" />);
export const TrashIcon = icon(
  <path d="M4 7h16M9 7V4.5h6V7M6.5 7l.9 12.1a1 1 0 001 .9h7.2a1 1 0 001-.9L17.5 7M10 11v5M14 11v5" />,
);
export const CopyIcon = icon(
  <>
    <rect x="8" y="8" width="12" height="12" rx="1.5" />
    <path d="M16 8V5.5A1.5 1.5 0 0014.5 4h-9A1.5 1.5 0 004 5.5v9A1.5 1.5 0 005.5 16H8" />
  </>,
);
export const DownloadIcon = icon(<path d="M12 4v11M7 10l5 5 5-5M5 20h14" />);
export const UploadIcon = icon(<path d="M12 15V4M7 9l5-5 5 5M5 20h14" />);
export const EyeIcon = icon(
  <>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.75" />
  </>,
);
export const EyeOffIcon = icon(
  <path d="M4 4l16 16M10.6 6a9.8 9.8 0 011.4-.1C18 5.9 21.5 12 21.5 12a17 17 0 01-2.6 3.4M6.3 7.4A16.6 16.6 0 002.5 12S6 18.5 12 18.5a9 9 0 004.4-1.1M10 10.2a2.7 2.7 0 003.8 3.8" />,
);
export const FilterIcon = icon(<path d="M4 5h16l-6 7.5V19l-4 1.5v-8L4 5z" />);
export const MoreIcon = icon(
  <>
    <circle cx="5.5" cy="12" r="1" fill="currentColor" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
    <circle cx="18.5" cy="12" r="1" fill="currentColor" />
  </>,
);
export const RefreshIcon = icon(
  <path d="M20 11a8 8 0 00-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0014.3 4.9L20 16M20 20v-4h-4" />,
);
export const SaveIcon = icon(
  <path d="M5 4h11l3 3v12a1 1 0 01-1 1H6a1 1 0 01-1-1V4zM8 4v5h7V4M8 20v-6h8v6" />,
);
export const SendIcon = icon(<path d="M20.5 3.5L10 14M20.5 3.5l-6.5 17-4-6.5-6.5-4 17-6.5z" />);
export const PrintIcon = icon(
  <path d="M7 9V4h10v5M7 17H5a1 1 0 01-1-1v-6a1 1 0 011-1h14a1 1 0 011 1v6a1 1 0 01-1 1h-2M7 14h10v6H7z" />,
);
export const LinkIcon = icon(
  <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />,
);

/* Status */
export const CheckIcon = icon(<path d="M5 12.5l4.5 4.5L19 7.5" />, { strokeWidth: "2.5" });
export const InfoIcon = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 8h.01" />
  </>,
);
export const SuccessIcon = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8 12.5l3 3 5-6" />
  </>,
);
export const WarningIcon = icon(
  <>
    <path d="M12 4l9 15.5H3L12 4z" />
    <path d="M12 10v4M12 16.8h.01" />
  </>,
);
export const DangerIcon = icon(
  <>
    <path d="M8.2 3.5h7.6l4.7 4.7v7.6l-4.7 4.7H8.2l-4.7-4.7V8.2l4.7-4.7z" />
    <path d="M12 8v5M12 16h.01" />
  </>,
);
export const LockIcon = icon(
  <>
    <rect x="5" y="10.5" width="14" height="9.5" rx="1.5" />
    <path d="M8 10.5V8a4 4 0 018 0v2.5" />
  </>,
);
export const BellIcon = icon(
  <path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15L6 16zM10 20.5a2.2 2.2 0 004 0" />,
);
export const CircleIcon = icon(<circle cx="12" cy="12" r="8.5" />);
export const HourglassIcon = icon(
  <path d="M7 4h10M7 20h10M8 4c0 4 8 4.5 8 8s-8 4-8 8M16 4c0 4-8 4.5-8 8" />,
);

/* Calendar and time */
export const CalendarIcon = icon(
  <>
    <rect x="4" y="5.5" width="16" height="14.5" rx="1.5" />
    <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
  </>,
);
export const CalendarCheckIcon = icon(
  <>
    <rect x="4" y="5.5" width="16" height="14.5" rx="1.5" />
    <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4M9 15l2 2 4-4" />
  </>,
);
export const ClockIcon = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </>,
);
export const RepeatIcon = icon(
  <path d="M17 3.5l3 3-3 3M4 11.5V10a3.5 3.5 0 013.5-3.5H20M7 20.5l-3-3 3-3M20 12.5V14a3.5 3.5 0 01-3.5 3.5H4" />,
);

/* People */
export const UserIcon = icon(
  <>
    <circle cx="12" cy="8" r="3.75" />
    <path d="M5 20a7 7 0 0114 0" />
  </>,
);
export const UsersIcon = icon(
  <>
    <circle cx="9" cy="8.5" r="3.25" />
    <path d="M3 19.5a6 6 0 0112 0M15.5 5.5a3.25 3.25 0 010 6.3M17 13.8a6 6 0 014 5.7" />
  </>,
);
export const UserPlusIcon = icon(
  <>
    <circle cx="10" cy="8" r="3.75" />
    <path d="M3 20a7 7 0 0112.5-4.3M18.5 13v6M15.5 16h6" />
  </>,
);
export const MailIcon = icon(
  <>
    <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />
    <path d="M4 7l8 6 8-6" />
  </>,
);
export const PhoneIcon = icon(
  <path d="M5 4h3.5l1.5 4-2 1.5a11 11 0 006.5 6.5L16 14l4 1.5V19a1 1 0 01-1 1A15 15 0 014 5a1 1 0 011-1z" />,
);
export const HeartIcon = icon(
  <path d="M12 19.5s-7.5-4.5-7.5-10A4.2 4.2 0 0112 7a4.2 4.2 0 017.5 2.5c0 5.5-7.5 10-7.5 10z" />,
);

/* Places and rooms */
export const ChurchIcon = icon(
  <path d="M12 2.5v4M10.5 4h3M6 20.5V12l6-5 6 5v8.5M3.5 20.5h17M10 20.5v-4a2 2 0 014 0v4" />,
);
export const DoorIcon = icon(
  <path d="M6 20.5V4.5a1 1 0 011-1h10a1 1 0 011 1v16M3.5 20.5h17M14.5 12.5h.01" />,
);
export const BuildingIcon = icon(
  <path d="M5 20.5V4.5a1 1 0 011-1h8a1 1 0 011 1v16M15 9.5h3a1 1 0 011 1v10M3.5 20.5h17M8.5 7.5h3M8.5 11h3M8.5 14.5h3" />,
);
export const MapPinIcon = icon(
  <>
    <path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0113 0c0 5-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.25" />
  </>,
);
export const KeyIcon = icon(
  <>
    <circle cx="8" cy="15" r="4" />
    <path d="M11 12l8.5-8.5M16.5 6.5l2.5 2.5M14 9l2 2" />
  </>,
);

/* Content, HR and documents */
export const FileTextIcon = icon(
  <path d="M14 3.5H7a1.5 1.5 0 00-1.5 1.5v14A1.5 1.5 0 007 20.5h10a1.5 1.5 0 001.5-1.5V8L14 3.5zM14 3.5V8h4.5M9 12.5h6M9 16h6" />,
);
export const InboxIcon = icon(
  <path d="M4 13.5l2.5-8h11l2.5 8M4 13.5V19a1 1 0 001 1h14a1 1 0 001-1v-5.5M4 13.5h4.5l1 2h5l1-2H20" />,
);
export const BriefcaseIcon = icon(
  <>
    <rect x="3.5" y="7.5" width="17" height="12" rx="1.5" />
    <path d="M9 7.5V5.5a1 1 0 011-1h4a1 1 0 011 1v2M3.5 12.5h17" />
  </>,
);
export const ClipboardIcon = icon(
  <path d="M9 4.5H7A1.5 1.5 0 005.5 6v13A1.5 1.5 0 007 20.5h10a1.5 1.5 0 001.5-1.5V6A1.5 1.5 0 0017 4.5h-2M9 3.5h6v2.5H9zM9 12l2 2 4-4" />,
);
export const MegaphoneIcon = icon(
  <path d="M4 10v4a1 1 0 001 1h2l9 4.5v-15L7 9H5a1 1 0 00-1 1zM7 15l1.5 5M19 9.5a3 3 0 010 5" />,
);
export const NewspaperIcon = icon(
  <path d="M5 4.5h12v14a2 2 0 002 2H6.5A1.5 1.5 0 015 19V4.5zM17 8.5h2.5V18.5a2 2 0 01-2 2M8 8h6M8 11.5h6M8 15h4" />,
);
export const ImageIcon = icon(
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
    <circle cx="9" cy="9.5" r="1.75" />
    <path d="M20.5 15.5l-5-5L5 19.5" />
  </>,
);
export const BookIcon = icon(
  <path d="M5 5a1.5 1.5 0 011.5-1.5H19v14H6.5A1.5 1.5 0 005 19V5zM5 19a1.5 1.5 0 001.5 1.5H19M9 7.5h6" />,
);
export const MusicIcon = icon(
  <>
    <path d="M9 17.5V5.5l11-2v12" />
    <circle cx="6.5" cy="17.5" r="2.5" />
    <circle cx="17.5" cy="15.5" r="2.5" />
  </>,
);

/* Settings */
export const SettingsIcon = icon(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3.5l1.6 2.3 2.8-.5.7 2.7 2.6 1.2-1 2.6 1 2.6-2.6 1.2-.7 2.7-2.8-.5L12 20.5l-1.6-2.3-2.8.5-.7-2.7-2.6-1.2 1-2.6-1-2.6 2.6-1.2.7-2.7 2.8.5L12 3.5z" />
  </>,
);
export const SlidersIcon = icon(<path d="M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4" />);
export const PaletteIcon = icon(
  <>
    <path d="M12 3.5a8.5 8.5 0 000 17c1.2 0 1.8-.8 1.8-1.7 0-1.4-1.3-1.6-1.3-2.8 0-1 .8-1.7 1.8-1.7h2.2a3.5 3.5 0 003.5-3.5c0-4-3.8-7.3-8-7.3z" />
    <circle cx="8" cy="11" r="1" fill="currentColor" />
    <circle cx="11" cy="7.5" r="1" fill="currentColor" />
    <circle cx="15.5" cy="8.5" r="1" fill="currentColor" />
  </>,
);
export const ShieldIcon = icon(
  <path d="M12 3.5l7 2.5v5.5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-2.5z" />,
);

/** Every icon by name, for catalogues (showcase) and data-driven menus. */
export const ICONS = {
  menu: MenuIcon,
  close: CloseIcon,
  chevronDown: ChevronDownIcon,
  chevronUp: ChevronUpIcon,
  chevronLeft: ChevronLeftIcon,
  chevronRight: ChevronRightIcon,
  arrowRight: ArrowRightIcon,
  arrowLeft: ArrowLeftIcon,
  externalLink: ExternalLinkIcon,
  home: HomeIcon,
  dashboard: DashboardIcon,
  search: SearchIcon,
  globe: GlobeIcon,
  logOut: LogOutIcon,
  plus: PlusIcon,
  edit: EditIcon,
  trash: TrashIcon,
  copy: CopyIcon,
  download: DownloadIcon,
  upload: UploadIcon,
  eye: EyeIcon,
  eyeOff: EyeOffIcon,
  filter: FilterIcon,
  more: MoreIcon,
  refresh: RefreshIcon,
  save: SaveIcon,
  send: SendIcon,
  print: PrintIcon,
  link: LinkIcon,
  check: CheckIcon,
  info: InfoIcon,
  success: SuccessIcon,
  warning: WarningIcon,
  danger: DangerIcon,
  lock: LockIcon,
  bell: BellIcon,
  circle: CircleIcon,
  hourglass: HourglassIcon,
  calendar: CalendarIcon,
  calendarCheck: CalendarCheckIcon,
  clock: ClockIcon,
  repeat: RepeatIcon,
  user: UserIcon,
  users: UsersIcon,
  userPlus: UserPlusIcon,
  mail: MailIcon,
  phone: PhoneIcon,
  heart: HeartIcon,
  church: ChurchIcon,
  door: DoorIcon,
  building: BuildingIcon,
  mapPin: MapPinIcon,
  key: KeyIcon,
  fileText: FileTextIcon,
  inbox: InboxIcon,
  briefcase: BriefcaseIcon,
  clipboard: ClipboardIcon,
  megaphone: MegaphoneIcon,
  newspaper: NewspaperIcon,
  image: ImageIcon,
  book: BookIcon,
  music: MusicIcon,
  settings: SettingsIcon,
  sliders: SlidersIcon,
  palette: PaletteIcon,
  shield: ShieldIcon,
} as const satisfies Record<string, IconComponent>;

export type IconName = keyof typeof ICONS;

/** Renders an icon by name (`<Icon name="calendar" />`); handy in data-driven navigation. */
export function Icon({ name, ...props }: IconProps & { name: IconName }) {
  const Component = ICONS[name];
  return <Component {...props} />;
}
