import { abortError, OcrEngine, type OcrOptions, type OcrPage } from "./engine";

/** An engine for tests: it gives the pages in order, one for each image. */
export class FakeOcrEngine extends OcrEngine {
  readonly id = "fake";
  readonly languages = ["hu"] as const;
  loaded = false;
  private readonly pages: OcrPage[];

  constructor(pages: OcrPage[]) {
    super();
    this.pages = [...pages];
  }

  async load(): Promise<void> {
    this.loaded = true;
  }

  async recognize(_image: Blob, options?: OcrOptions): Promise<OcrPage> {
    if (options?.signal?.aborted) throw abortError();
    if (!this.loaded) throw new Error("Call load() first");
    const page = this.pages.shift();
    if (!page) throw new Error("No more pages");
    options?.onProgress?.({ stage: "recognize", ratio: 1 });
    return page;
  }

  override dispose(): void {
    this.loaded = false;
  }
}
