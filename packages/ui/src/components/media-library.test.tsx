import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  MediaLibrary,
  MediaPicker,
  type MediaItem,
  type MediaLibraryLabels,
  type MediaUploadInput,
} from "../index";
import { formatBytes } from "./media-library";

const labels: MediaLibraryLabels = {
  gridLabel: "Fájlok",
  empty: "Üres",
  usage: (used, quota) => `Tárhely: ${used} / ${quota}`,
  usageMeterLabel: "Tárhely",
  uploadTitle: "Feltöltés",
  fileLabel: "Fájl",
  fileHelp: "súgó",
  fileRequired: "Válasszon fájlt",
  altLabel: "Képleírás",
  altHelp: "súgó",
  altRequired: "Képleírás kötelező",
  decorative: "Díszítő",
  captionLabel: "Képaláírás",
  peopleConsent: "Hozzájárulás",
  peopleConsentHelp: "súgó",
  rights: "Jogom van hozzá",
  rightsRequired: "Meg kell erősíteni",
  upload: "Feltöltés indítása",
  uploading: "Feltöltés…",
  uploaded: (f) => `${f} feltöltve`,
  uploadFailed: "Hiba",
  editText: "Szerkesztés",
  editAria: (f) => `Szerkesztés: ${f}`,
  editTitle: "Adatok",
  save: "Mentés",
  saved: "Mentve",
  saveFailed: "Mentési hiba",
  deleteText: "Törlés",
  deleteAria: (f) => `Törlés: ${f}`,
  deleteTitle: "Törlés?",
  deleteConfirm: (f) => `Törli a(z) ${f} fájlt?`,
  deleteAction: "Végleges törlés",
  deleted: "Törölve",
  cancel: "Mégse",
  close: "Bezárás",
  selectText: "Kiválasztás",
  selectAria: (f) => `Kiválasztás: ${f}`,
  pickerTitle: "Kép kiválasztása",
  pickerDescription: "Válasszon",
  kindPdf: "PDF",
  kindAudio: "Hang",
  kindOther: "Fájl",
  noAlt: "Nincs leírás",
  decorativeBadge: "Díszítő",
  consentBadge: "Hozzájárulás",
};

const image: MediaItem = {
  id: "m1",
  filename: "templom.svg",
  kind: "image",
  src: "/demo/templom.svg",
  alt: "A templom",
  decorative: false,
  caption: null,
  peopleConsent: true,
  width: 1600,
  height: 900,
  bytes: 3623,
};
const pdf: MediaItem = { ...image, id: "m2", filename: "rend.pdf", kind: "pdf", src: null };

const ok = () => Promise.resolve({ ok: true } as const);

function setup(items: MediaItem[] = [image, pdf]) {
  const handlers = {
    onUpload: vi.fn((_input: MediaUploadInput) => ok()),
    onUpdate: vi.fn(ok),
    onDelete: vi.fn(ok),
  };
  render(
    <MediaLibrary
      items={items}
      usage={{ bytes: 1024 * 1024, quotaBytes: 1024 ** 3 }}
      labels={labels}
      {...handlers}
    />,
  );
  return handlers;
}

describe("formatBytes", () => {
  it("uses a decimal comma and binary units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1,5 KB");
    expect(formatBytes(1024 ** 3)).toBe("1 GB");
  });
});

describe("<MediaLibrary>", () => {
  it("shows the grid and the storage quota", () => {
    setup();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Tárhely: 1 MB / 1 GB")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "Tárhely" })).toBeInTheDocument();
    expect(screen.getByAltText("A templom")).toBeInTheDocument();
  });

  it("requires a file, alt text and the rights confirmation before uploading", async () => {
    const user = userEvent.setup();
    const { onUpload } = setup();
    await user.click(screen.getByRole("button", { name: "Feltöltés indítása" }));
    expect(screen.getByText("Válasszon fájlt")).toBeInTheDocument();
    expect(screen.getByText("Meg kell erősíteni")).toBeInTheDocument();

    const file = new File(["x"], "orgona.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText("Fájl"), file);
    await user.click(screen.getByRole("button", { name: "Feltöltés indítása" }));
    expect(screen.getByText("Képleírás kötelező")).toBeInTheDocument();
    expect(onUpload).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/Képleírás/), "Az orgona");
    await user.click(screen.getByLabelText("Jogom van hozzá"));
    await user.click(screen.getByLabelText("Hozzájárulás"));
    await user.click(screen.getByRole("button", { name: "Feltöltés indítása" }));
    await waitFor(() => expect(onUpload).toHaveBeenCalled(), { timeout: 4000 });
    expect(onUpload.mock.calls[0]?.[0]).toMatchObject({
      filename: "orgona.jpg",
      mimeType: "image/jpeg",
      alt: "Az orgona",
      decorative: false,
      peopleConsent: true,
    });
    expect(
      await screen.findByText("orgona.jpg feltöltve", {}, { timeout: 4000 }),
    ).toBeInTheDocument();
  });

  it("accepts a decorative image without alt text", async () => {
    const user = userEvent.setup();
    const { onUpload } = setup();
    await user.upload(
      screen.getByLabelText("Fájl"),
      new File(["x"], "minta.png", { type: "image/png" }),
    );
    await user.click(screen.getByLabelText("Díszítő"));
    await user.click(screen.getByLabelText("Jogom van hozzá"));
    await user.click(screen.getByRole("button", { name: "Feltöltés indítása" }));
    await waitFor(() => expect(onUpload).toHaveBeenCalled(), { timeout: 4000 });
    expect(onUpload.mock.calls[0]?.[0]).toMatchObject({ alt: null, decorative: true });
  });

  it("does not ask for alt text for a PDF", async () => {
    const user = userEvent.setup();
    const { onUpload } = setup();
    await user.upload(
      screen.getByLabelText("Fájl"),
      new File(["x"], "rend.pdf", { type: "application/pdf" }),
    );
    expect(screen.queryByLabelText(/Képleírás/)).toBeNull();
    await user.click(screen.getByLabelText("Jogom van hozzá"));
    await user.click(screen.getByRole("button", { name: "Feltöltés indítása" }));
    await waitFor(() => expect(onUpload).toHaveBeenCalled(), { timeout: 4000 });
  });

  it("edits alt text and refuses to clear it", async () => {
    const user = userEvent.setup();
    const { onUpdate } = setup();
    await user.click(screen.getByRole("button", { name: "Szerkesztés: templom.svg" }));
    const alt = screen.getByLabelText(/Képleírás/);
    await user.clear(alt);
    await user.click(screen.getByRole("button", { name: "Mentés" }));
    expect(screen.getByText("Képleírás kötelező")).toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();
    await user.type(alt, "Új leírás");
    await user.click(screen.getByRole("button", { name: "Mentés" }));
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith("m1", expect.objectContaining({ alt: "Új leírás" })),
    );
  });

  it("asks for confirmation before deleting", async () => {
    const user = userEvent.setup();
    const { onDelete } = setup();
    await user.click(screen.getByRole("button", { name: "Törlés: templom.svg" }));
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Végleges törlés" }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith("m1"));
  });
});

describe("<MediaPicker>", () => {
  it("lists images only and selects one", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <MediaPicker
        open
        onOpenChange={() => {}}
        onSelect={onSelect}
        items={[image, pdf]}
        usage={{ bytes: 0, quotaBytes: 1024 }}
        labels={labels}
        onUpload={ok}
        onUpdate={ok}
        onDelete={ok}
      />,
    );
    expect(screen.queryByText("rend.pdf")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Kiválasztás: templom.svg" }));
    expect(onSelect).toHaveBeenCalledWith(image);
  });
});
