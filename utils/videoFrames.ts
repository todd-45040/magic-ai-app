/**
 * Extract a small set of representative frames from a user-uploaded video.
 * This allows Gemini Vision to ground feedback in what is actually visible,
 * rather than "simulating" an analysis from file metadata.
 *
 * Notes:
 * - This runs fully client-side using <video> + <canvas>.
 * - We intentionally resize frames to keep payload size reasonable.
 * - If a browser blocks seeking due to codec issues, this will throw.
 */

export type ExtractedFrame = {
  mimeType: 'image/jpeg';
  base64Data: string; // base64 ONLY (no data: prefix)
  timeSec: number;
};

type Options = {
  frameCount?: number;     // default 12
  maxWidth?: number;       // default 640
  jpegQuality?: number;    // default 0.72
  // Avoid capturing first/last instant which can be blank.
  trimStartSec?: number;   // default 0.25
  trimEndSec?: number;     // default 0.25
};

function waitForEvent(target: EventTarget, eventName: string, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for video ${eventName}.`));
    }, timeoutMs);

    const handler = () => {
      cleanup();
      resolve();
    };

    const cleanup = () => {
      window.clearTimeout(t);
      target.removeEventListener(eventName, handler as any);
    };

    target.addEventListener(eventName, handler as any, { once: true });
  });
}

function dataUrlToBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

async function seek(video: HTMLVideoElement, timeSec: number): Promise<void> {
  // Some browsers need time to settle; use the 'seeked' event.
  const clamped = Math.max(0, Math.min(timeSec, Math.max(0, (video.duration || 0) - 0.01)));
  video.currentTime = clamped;
  await waitForEvent(video, 'seeked', 15000);
}

export async function extractVideoFrames(file: File, opts: Options = {}): Promise<ExtractedFrame[]> {
  const {
    frameCount = 12,
    maxWidth = 640,
    jpegQuality = 0.72,
    trimStartSec = 0.25,
    trimEndSec = 0.25,
  } = opts;

  if (!file.type.startsWith('video/')) {
    throw new Error('Selected file is not a video.');
  }

  // Create offscreen video
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  const objectUrl = URL.createObjectURL(file);
  video.src = objectUrl;

  try {
    // Wait for metadata (duration, size)
    await waitForEvent(video, 'loadedmetadata', 15000);

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (!duration || duration < 0.2) {
      throw new Error('Could not read video duration. The video may be unsupported.');
    }

    const start = Math.min(Math.max(0, trimStartSec), Math.max(0, duration - 0.1));
    const end = Math.max(start, duration - trimEndSec);
    const usable = Math.max(0.1, end - start);

    // Evenly spaced timestamps across usable duration
    const n = Math.max(3, Math.min(frameCount, 30));
    const times: number[] = [];
    for (let i = 0; i < n; i++) {
      const t = start + (usable * i) / (n - 1);
      times.push(t);
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create canvas context.');

    // Determine scaled size
    const vw = video.videoWidth || 0;
    const vh = video.videoHeight || 0;
    if (!vw || !vh) {
      throw new Error('Could not read video dimensions.');
    }

    const scale = Math.min(1, maxWidth / vw);
    canvas.width = Math.round(vw * scale);
    canvas.height = Math.round(vh * scale);

    const frames: ExtractedFrame[] = [];

    for (const t of times) {
      await seek(video, t);

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', jpegQuality);
      frames.push({
        mimeType: 'image/jpeg',
        base64Data: dataUrlToBase64(dataUrl),
        timeSec: t,
      });
    }

    return frames;
  } finally {
    URL.revokeObjectURL(objectUrl);
    // best-effort cleanup
    video.removeAttribute('src');
    try { video.load(); } catch {}
  }
}
