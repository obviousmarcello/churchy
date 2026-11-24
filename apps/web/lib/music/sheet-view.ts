import { z } from "zod";

// The settings of the chord sheet that the user sets for each arrangement and
// device type: the layout of a song on the screen. They live in
// `user_arrangement_views`, so they follow the user to other devices of the
// same type. A song without its own value uses the device's value (see
// `sheet-settings.ts`), and so does a text item of an event.

/** A phone, a tablet on a music stand and a computer need other sizes and columns. */
export const DEVICE_TYPES = ["phone", "tablet", "desktop"] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

/** Text sizes, in percent of `SHEET_BASE_FONT_PX`: from 60 to 300, in steps of 5. */
export const SHEET_SIZES: readonly number[] = Array.from(
  { length: 49 },
  (_, index) => 60 + index * 5,
);
/** The steps of the Smaller and Larger buttons, of `SHEET_SIZES`: fewer, so a few taps go far. */
export const SHEET_BUTTON_SIZES: readonly number[] = [
  60, 70, 80, 90, 100, 115, 130, 150, 175, 200, 250, 300,
];
export const SHEET_MAX_PAGES = 4;

/** The text size after a pinch of `factor` from `size`: the nearest of `SHEET_SIZES` by ratio. */
export function pinchSize(size: number, factor: number): number {
  const target = Math.log(size * factor);
  return SHEET_SIZES.reduce((nearest, option) =>
    Math.abs(Math.log(option) - target) < Math.abs(Math.log(nearest) - target) ? option : nearest,
  );
}

/** The settings of a song. `sheet-settings.ts` adds the device's defaults to them. */
export const sheetViewFields = {
  /** Only one of `SHEET_SIZES`: a pinch gives any of them, the buttons step through `SHEET_BUTTON_SIZES`. */
  size: z.number().refine((size) => SHEET_SIZES.includes(size)),
  /** The number of pages side by side. `auto`: as many as the width of the screen holds. */
  pagesOnScreen: z.union([z.literal("auto"), z.number().int().min(1).max(SHEET_MAX_PAGES)]),
  showChords: z.boolean(),
  /** The syllable where each chord comes in has a line under it. */
  underlineSyllables: z.boolean(),
  /** `arrangement`: the arrangement's section order, if it has one. */
  order: z.enum(["arrangement", "written"]),
  /** How to show a section that the song played before. */
  repeats: z.enum(["full", "label"]),
  /**
   * What the sheet shows of the song: the chords, or one of its scores, PDF
   * files or images, by id. Only for a song: the device has no value (see
   * `sheet-content.ts` for the song without one).
   */
  content: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("chords") }),
    z.object({ kind: z.literal("score"), id: z.uuid() }),
    z.object({ kind: z.literal("pdf"), id: z.uuid() }),
    z.object({ kind: z.literal("image"), id: z.uuid() }),
  ]),
};

/** The values that the user set for a song. The others come from the device. */
export const sheetViewSchema = z.strictObject(sheetViewFields).partial();
export type SheetView = z.output<typeof sheetViewSchema>;

/** A stored view: a value that is not valid anymore (e.g. a size that the sheet does not have) drops out. */
export const storedSheetViewSchema = z.object(
  Object.fromEntries(
    Object.entries(sheetViewFields).map(([name, field]) => [
      name,
      (field as z.ZodType).optional().catch(undefined),
    ]),
  ) as {
    [Name in keyof typeof sheetViewFields]: z.ZodCatch<
      z.ZodOptional<(typeof sheetViewFields)[Name]>
    >;
  },
);

/** The user's views of an arrangement, by device type. */
export type SongViews = Partial<Record<DeviceType, SheetView>>;

/** The view without the settings that use the device's value. */
export function ownValues(view: SheetView): SheetView {
  return Object.fromEntries(Object.entries(view).filter(([, value]) => value !== undefined));
}

export function isEmptyView(view: SheetView): boolean {
  return Object.keys(ownValues(view)).length === 0;
}

export type SheetContentChoice = NonNullable<SheetView["content"]>;

/** The layout of the view: all its values but the content. */
export function layoutValues(view: SheetView): SheetView {
  const layout = { ...view };
  delete layout.content;
  return layout;
}
