// The parts of the Verovio toolkit that the sheet uses. The package has no
// types. See https://book.verovio.org/toolkit-reference/toolkit-methods.html.

declare module "verovio/wasm" {
  /** The compiled engraver, with the WebAssembly code in the file. */
  export type VerovioModule = { readonly __verovioModule: unique symbol };
  export default function createVerovioModule(): Promise<VerovioModule>;
}

declare module "verovio/esm" {
  import type { VerovioModule } from "verovio/wasm";

  export class VerovioToolkit {
    constructor(module: VerovioModule);
    setOptions(options: Record<string, unknown>): void;
    resetOptions(): void;
    /** MEI, MusicXML and other formats as text. False when it cannot read the data. */
    loadData(data: string): boolean;
    /** Compressed MusicXML (`.mxl`). False when it cannot read the data. */
    loadZipDataBuffer(data: ArrayBuffer): boolean;
    getPageCount(): number;
    /** When each note starts and stops, by element id. `tstamp` is in ms. */
    renderToTimemap(options?: Record<string, unknown>): {
      tstamp: number;
      qstamp: number;
      on?: string[];
      off?: string[];
      /** Quarter notes per minute, from here. */
      tempo?: number;
      /** With `includeMeasures`: the bar that starts here. */
      measureOn?: string;
    }[];
    /** The MIDI note number of a note, and its time and duration in ms. */
    getMIDIValuesForElement(id: string): { pitch: number; time: number; duration: number };
    /** The loaded score in MEI, Verovio's own format. */
    getMEI(options?: Record<string, unknown>): string;
    /** A page from 1, as SVG. */
    renderToSVG(page?: number, xmlDeclaration?: boolean): string;
    destroy(): void;
  }
}
