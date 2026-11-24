"use client";

import { useId } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Popover } from "@base-ui/react/popover";
import {
  FileMusicIcon,
  FileTextIcon,
  ImageIcon,
  ListMusicIcon,
  SquareArrowOutUpRightIcon,
} from "lucide-react";

import { Button } from "@/components/music/ui/button";
import { useI18n } from "@/i18n/music/client";
import type { I18n } from "@/i18n/music/i18n";
import { imageHref, pdfHref, SHEET_PATH } from "@/lib/music/next-path";
import { findScore, isInKey, type SheetContent } from "@/lib/music/sheet-content";
import type { SheetContentChoice } from "@/lib/music/sheet-view";
import { cn } from "@/lib/music/utils";
import type { SongImageDTO } from "@/server/music/models/images";
import type { SongPdfDTO } from "@/server/music/models/pdfs";
import type { SongScoreDTO } from "@/server/music/models/scores";
import { finalFocusOf, type PopoverControl } from "./sheet-more-menu";

type SongContent = SheetContent<SongScoreDTO, SongPdfDTO, SongImageDTO>;

/** The icon of the content in the header and in the "more" menu. */
export function ContentIcon({ content, className }: { content: SongContent; className?: string }) {
  const Icon = { chords: ListMusicIcon, score: FileMusicIcon, pdf: FileTextIcon, image: ImageIcon }[
    content.kind
  ];
  return <Icon className={className} />;
}

/** The score, PDF file or image of the content. Null: the chords. */
function contentFile(content: SongContent): { id: string; name: string } | null {
  if (content.kind === "score") return content.score;
  if (content.kind === "pdf") return content.pdf;
  if (content.kind === "image") return content.image;
  return null;
}

/** The name of the content, e.g. "Chords" or the name of the PDF file. */
export function contentName({ m }: I18n, content: SongContent): string {
  return contentFile(content)?.name ?? m.sheet.content.chords;
}

type Option = {
  choice: SheetContentChoice;
  label: string;
  /** The file is in the key of the sheet. */
  inKey: boolean;
  /** The own page of a PDF file or an image. */
  href: string | null;
};

/**
 * A button with the view of the song at the top of the screen: the chords, or
 * one of its scores, PDF files or images. The choice is for this song on this
 * type of device. A score can also show in every song with a score of its
 * name (`scoreName`, of the device). The files in the key that the sheet shows
 * (`shownKey`, English note names) come first in their group.
 */
export function SongViewButton({
  scores,
  pdfs,
  images,
  shown,
  shownKey,
  scoreName,
  title,
  error,
  onChange,
  onScoreNameChange,
  control,
  className,
}: {
  scores: SongScoreDTO[];
  pdfs: SongPdfDTO[];
  images: SongImageDTO[];
  shown: SongContent;
  shownKey: string | null;
  scoreName: string | null;
  /** The title of the setting, e.g. with the song's name. */
  title: string;
  /** The save of the last choice failed. */
  error: string | null;
  onChange: (choice: SheetContentChoice) => void;
  onScoreNameChange: (name: string | null) => void;
  /** The "more" menu opens it. */
  control?: PopoverControl;
  /** Of the header button. */
  className?: string;
}) {
  const i18n = useI18n();
  const { m, format } = i18n;
  const t = m.sheet.content;
  const name = useId();
  const search = useSearchParams();
  const from = `${SHEET_PATH}?${search}`;
  const view = contentName(i18n, shown);
  // Stable: the files keep their order by name after the ones in the key.
  const byKey = (options: Option[]) =>
    options.toSorted((a, b) => Number(b.inKey) - Number(a.inKey));

  const groups: { label: string | null; icon: typeof ListMusicIcon; options: Option[] }[] = [
    {
      label: null,
      icon: ListMusicIcon,
      options: [{ choice: { kind: "chords" }, label: t.chords, inKey: false, href: null }],
    },
    {
      label: t.scores,
      icon: FileMusicIcon,
      options: scores.map((score) => ({
        choice: { kind: "score", id: score.id },
        label: score.name,
        inKey: false,
        href: null,
      })),
    },
    {
      label: t.pdfs,
      icon: FileTextIcon,
      options: byKey(
        pdfs.map((pdf) => ({
          choice: { kind: "pdf", id: pdf.id },
          label: pdf.name,
          inKey: isInKey(pdf, shownKey),
          href: pdfHref(pdf.id, from),
        })),
      ),
    },
    {
      label: t.images,
      icon: ImageIcon,
      options: byKey(
        images
          .filter((image) => image.pages.length > 0)
          .map((image) => ({
            choice: { kind: "image", id: image.id },
            label: image.name,
            inKey: isInKey(image, shownKey),
            href: imageHref(image.id, from),
          })),
      ),
    },
  ];
  const shownId = contentFile(shown)?.id;
  const isShown = (choice: SheetContentChoice) =>
    choice.kind === shown.kind && (choice.kind === "chords" || choice.id === shownId);
  const shownScore = shown.kind === "score" ? shown.score : null;
  const forEverySong = shownScore !== null && findScore([shownScore], scoreName) !== null;

  return (
    <Popover.Root open={control?.open} onOpenChange={control?.onOpenChange}>
      <Popover.Trigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label={format(t.button, { view })}
            title={format(t.button, { view })}
            className={cn(
              "h-8 max-w-40 min-w-8 px-2 pointer-coarse:h-9 pointer-coarse:min-w-9",
              className,
            )}
          />
        }
      >
        <ContentIcon content={shown} />
        {/* The header has room for the text only on large screens. */}
        <span className="hidden truncate xl:inline">{view}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          anchor={control?.anchor}
          sideOffset={8}
          align="end"
          collisionPadding={8}
          className="z-50"
        >
          <Popover.Popup
            finalFocus={finalFocusOf(control)}
            className="flex max-h-[var(--available-height)] w-80 max-w-[calc(100vw-1rem)] origin-[var(--transform-origin)] flex-col gap-3 overflow-y-auto rounded-lg border bg-surface-raised p-4 text-text shadow-lg outline-none transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0"
          >
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1.5 truncate text-xs font-medium text-muted">{title}</legend>
              {groups
                .filter((group) => group.options.length > 0)
                .map((group) => (
                  <div key={group.label ?? ""} className="flex flex-col gap-1">
                    {group.label && <p className="mt-2 px-2 text-xs text-muted">{group.label}</p>}
                    {group.options.map((option) => (
                      <div
                        key={option.choice.kind === "chords" ? "chords" : option.choice.id}
                        className="flex items-center gap-1"
                      >
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-surface-sunken has-checked:bg-primary has-checked:text-primary-contrast has-focus-visible:ring-3 has-focus-visible:ring-focus/50">
                          <input
                            type="radio"
                            name={name}
                            className="sr-only"
                            checked={isShown(option.choice)}
                            onChange={() => onChange(option.choice)}
                          />
                          <group.icon className="size-4 shrink-0" />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate">{option.label}</span>
                            {option.inKey && <span className="text-xs opacity-75">{t.inKey}</span>}
                          </span>
                        </label>
                        {option.href && (
                          <Link
                            href={option.href}
                            aria-label={format(t.open, { name: option.label })}
                            title={format(t.open, { name: option.label })}
                            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-sunken hover:text-text focus-visible:ring-3 focus-visible:ring-focus/50 focus-visible:outline-none pointer-coarse:size-9"
                          >
                            <SquareArrowOutUpRightIcon className="size-4" />
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
            </fieldset>
            {shownScore && (
              <label className="flex items-start gap-2 text-sm pointer-coarse:py-1">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 accent-(--color-primary)"
                  checked={forEverySong}
                  onChange={(event) =>
                    onScoreNameChange(event.target.checked ? shownScore.name : null)
                  }
                />
                {format(t.everySong, { name: shownScore.name })}
              </label>
            )}
            {error && (
              <p role="alert" className="text-xs text-danger">
                {error}
              </p>
            )}
            <p className="text-xs text-muted">{t.hint}</p>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
