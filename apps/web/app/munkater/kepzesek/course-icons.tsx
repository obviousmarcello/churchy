"use client";

import {
  AudioLinesIcon,
  BabyIcon,
  BookHeartIcon,
  BookOpenIcon,
  BriefcaseMedicalIcon,
  CableIcon,
  CalendarIcon,
  CameraIcon,
  CarIcon,
  CastIcon,
  ChurchIcon,
  ClapperboardIcon,
  ClockIcon,
  CoffeeIcon,
  CrossIcon,
  DoorOpenIcon,
  DrumIcon,
  FlagIcon,
  GraduationCapIcon,
  GuitarIcon,
  HandHeartIcon,
  HandHelpingIcon,
  HeadphonesIcon,
  HeartIcon,
  ImageIcon,
  KeyboardIcon,
  LampCeilingIcon,
  LaptopIcon,
  LecternIcon,
  LightbulbIcon,
  ListMusicIcon,
  MapPinIcon,
  MegaphoneIcon,
  MessageCircleIcon,
  MicIcon,
  MicVocalIcon,
  MonitorIcon,
  Music2Icon,
  MusicIcon,
  PaletteIcon,
  PenLineIcon,
  PianoIcon,
  PlugIcon,
  PresentationIcon,
  PrinterIcon,
  ProjectorIcon,
  RadioIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  SmartphoneIcon,
  SparklesIcon,
  SpeakerIcon,
  StarIcon,
  SunIcon,
  TvIcon,
  UsersIcon,
  UtensilsIcon,
  VideoIcon,
  Volume2Icon,
  WifiIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";

import { courseImageUrl, type CourseCover, type CourseIcon } from "@/lib/music/courses";
import { cn } from "@/lib/music/utils";

/** The component of each icon of `COURSE_ICONS`. */
export const COURSE_ICON_COMPONENTS: Record<CourseIcon, LucideIcon> = {
  "graduation-cap": GraduationCapIcon,
  camera: CameraIcon,
  video: VideoIcon,
  clapperboard: ClapperboardIcon,
  monitor: MonitorIcon,
  tv: TvIcon,
  projector: ProjectorIcon,
  presentation: PresentationIcon,
  cast: CastIcon,
  radio: RadioIcon,
  mic: MicIcon,
  "mic-vocal": MicVocalIcon,
  headphones: HeadphonesIcon,
  speaker: SpeakerIcon,
  "volume-2": Volume2Icon,
  "audio-lines": AudioLinesIcon,
  "sliders-horizontal": SlidersHorizontalIcon,
  cable: CableIcon,
  plug: PlugIcon,
  laptop: LaptopIcon,
  smartphone: SmartphoneIcon,
  keyboard: KeyboardIcon,
  wifi: WifiIcon,
  lightbulb: LightbulbIcon,
  "lamp-ceiling": LampCeilingIcon,
  sun: SunIcon,
  sparkles: SparklesIcon,
  music: MusicIcon,
  "music-2": Music2Icon,
  guitar: GuitarIcon,
  piano: PianoIcon,
  drum: DrumIcon,
  "list-music": ListMusicIcon,
  "book-open": BookOpenIcon,
  "book-heart": BookHeartIcon,
  church: ChurchIcon,
  lectern: LecternIcon,
  cross: CrossIcon,
  heart: HeartIcon,
  "hand-heart": HandHeartIcon,
  "hand-helping": HandHelpingIcon,
  users: UsersIcon,
  baby: BabyIcon,
  coffee: CoffeeIcon,
  utensils: UtensilsIcon,
  "door-open": DoorOpenIcon,
  car: CarIcon,
  "map-pin": MapPinIcon,
  calendar: CalendarIcon,
  clock: ClockIcon,
  "shield-check": ShieldCheckIcon,
  "briefcase-medical": BriefcaseMedicalIcon,
  star: StarIcon,
  flag: FlagIcon,
  megaphone: MegaphoneIcon,
  "message-circle": MessageCircleIcon,
  "pen-line": PenLineIcon,
  palette: PaletteIcon,
  image: ImageIcon,
  printer: PrinterIcon,
  settings: SettingsIcon,
  wrench: WrenchIcon,
};

/**
 * The cover of a course: its image, or its icon, or the default icon. A
 * square with rounded corners; `className` sets the size. Only decoration:
 * the title of the course is next to it.
 */
export function CourseCoverView({ cover, className }: { cover: CourseCover; className?: string }) {
  if (cover.imagePath) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a private file: the image optimizer cannot read it.
      <img
        src={courseImageUrl(cover.imagePath)}
        alt=""
        className={cn("shrink-0 rounded-lg border bg-muted object-cover", className)}
      />
    );
  }
  const Icon = COURSE_ICON_COMPONENTS[cover.icon ?? "graduation-cap"];
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg border bg-primary/10 text-primary",
        className,
      )}
      aria-hidden
    >
      <Icon className="size-1/2" aria-hidden />
    </span>
  );
}
