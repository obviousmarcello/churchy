// The poster of a background video: a still frame of it, made in the browser
// before the upload (the server cannot decode a video). The theme uses it as
// its background image, e.g. in the tiles of the controller and in the
// downloads of the slides.

/** The browser cannot play the video, e.g. a codec that it does not have. */
class VideoDecodeError extends Error {
  constructor() {
    super("The browser cannot decode this video");
    this.name = "VideoDecodeError";
  }
}

/** The time of the frame, in seconds: the first frame of a video is often black. */
const POSTER_TIME_S = 1;
/** The wait for the browser to load the video and the frame. */
const LOAD_TIMEOUT_MS = 20_000;

/**
 * A still frame of the video as a JPEG file, at most `maxSide` pixels on its
 * longest side. The JPEG uses each of `qualities` in turn until the file is
 * at most `maxBytes`; the last quality gives the file also when it is larger.
 * Throws `VideoDecodeError` when the browser cannot show a picture of the video.
 */
export async function videoPoster(
  file: Blob,
  {
    maxSide,
    qualities,
    maxBytes,
  }: { maxSide: number; qualities: readonly number[]; maxBytes: number },
): Promise<Blob> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    await waitFor(video, "loadeddata", () => {
      video.src = url;
    });
    if (video.videoWidth === 0 || video.videoHeight === 0) throw new VideoDecodeError();
    const time = Number.isFinite(video.duration) ? Math.min(POSTER_TIME_S, video.duration / 2) : 0;
    if (time > 0) {
      await waitFor(video, "seeked", () => {
        video.currentTime = time;
      });
    }

    const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new VideoDecodeError();
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    let blob: Blob | null = null;
    for (const quality of qualities) {
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (!blob) throw new VideoDecodeError();
      if (blob.size <= maxBytes) break;
    }
    if (!blob) throw new VideoDecodeError();
    return blob;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

/** Runs `start`, then waits for the event. `VideoDecodeError` after an error or a long wait. */
function waitFor(
  video: HTMLVideoElement,
  event: "loadeddata" | "seeked",
  start: () => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (error: boolean) => {
      clearTimeout(timer);
      video.removeEventListener(event, onEvent);
      video.removeEventListener("error", onError);
      if (error) reject(new VideoDecodeError());
      else resolve();
    };
    const onEvent = () => done(false);
    const onError = () => done(true);
    const timer = setTimeout(() => done(true), LOAD_TIMEOUT_MS);
    video.addEventListener(event, onEvent);
    video.addEventListener("error", onError);
    start();
  });
}
