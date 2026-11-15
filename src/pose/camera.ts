// Opens and closes the iPhone camera.
//
// PRIVACY: the camera picture goes straight into a <video> element on this
// page and is read by the pose model on this phone. We never create a
// recorder, never save frames, and never send anything over the network.

export type Facing = 'user' | 'environment';

export interface CameraOptions {
  /** 'user' = front (selfie) camera, 'environment' = back camera. */
  facing: Facing;
  /** The picture size we ask for. The phone may give something close. */
  width: number;
  height: number;
  frameRate: number;
}

export interface CameraInfo {
  width: number;
  height: number;
  frameRate: number;
  facing: Facing;
  label: string;
}

export interface CameraHandle {
  readonly stream: MediaStream;
  info(): CameraInfo;
  /** Fully turns the camera off (the green dot goes away). */
  stop(): void;
  /** Called if iOS takes the camera away (phone call, another app). */
  onInterrupted: (() => void) | null;
  /**
   * Called when iOS temporarily silences the camera feed ("mutes" it) or
   * brings it back. The feed still exists, but frames stop arriving.
   */
  onMuteChange: ((muted: boolean) => void) | null;
}

export type CameraErrorKind =
  | 'insecure' // page is not on https
  | 'unsupported' // browser has no camera API
  | 'denied' // user (or a setting) said no
  | 'not-found' // no camera on this device
  | 'in-use' // another app is holding the camera
  | 'unknown';

export class CameraError extends Error {
  constructor(
    readonly kind: CameraErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'CameraError';
  }
}

/** Plain-English explanation for each failure, shown to the user. */
export const CAMERA_HELP: Record<CameraErrorKind, string> = {
  insecure: 'The camera only works on a secure (https) page.',
  unsupported: 'This browser cannot use the camera. Please open the page in Safari.',
  denied:
    'Camera access was blocked. Open Settings → Apps → Safari → Camera and choose "Ask" or "Allow", then reload this page.',
  'not-found': 'No camera was found on this device.',
  'in-use': 'The camera is busy in another app. Close other camera apps and try again.',
  unknown: 'The camera could not start. Please reload the page and try again.',
};

export async function openCamera(video: HTMLVideoElement, opts: CameraOptions): Promise<CameraHandle> {
  if (!window.isSecureContext) throw new CameraError('insecure', CAMERA_HELP.insecure);
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraError('unsupported', CAMERA_HELP.unsupported);

  let stream: MediaStream;
  try {
    // "ideal" means "please try for this, but give me your nearest match"
    // rather than failing if the exact size is not available.
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: opts.facing,
        width: { ideal: opts.width },
        height: { ideal: opts.height },
        frameRate: { ideal: opts.frameRate },
      },
    });
  } catch (err) {
    throw toCameraError(err);
  }

  const track = stream.getVideoTracks()[0];
  if (!track) {
    stopStream(stream);
    throw new CameraError('not-found', CAMERA_HELP['not-found']);
  }

  // iOS needs these three, or the video goes full-screen / refuses to play.
  video.playsInline = true;
  video.muted = true;
  video.autoplay = true;
  video.srcObject = stream;
  try {
    await video.play();
    await waitForFirstFrame(video);
  } catch (err) {
    stopStream(stream);
    video.srcObject = null;
    throw toCameraError(err);
  }

  const handle: CameraHandle = {
    stream,
    onInterrupted: null,
    onMuteChange: null,
    info() {
      const s = track.getSettings();
      return {
        // videoWidth/Height are the true size of the frames we receive.
        // In portrait, iOS hands us a rotated picture (e.g. 480x640).
        width: video.videoWidth,
        height: video.videoHeight,
        frameRate: Math.round(s.frameRate ?? 0),
        facing: (s.facingMode as Facing | undefined) ?? opts.facing,
        label: track.label,
      };
    },
    stop() {
      track.removeEventListener('ended', interrupted);
      track.removeEventListener('mute', muted);
      track.removeEventListener('unmute', unmuted);
      stopStream(stream);
      video.srcObject = null;
    },
  };

  function interrupted() {
    handle.onInterrupted?.();
  }
  function muted() {
    handle.onMuteChange?.(true);
  }
  function unmuted() {
    handle.onMuteChange?.(false);
  }
  track.addEventListener('ended', interrupted);
  track.addEventListener('mute', muted);
  track.addEventListener('unmute', unmuted);

  return handle;
}

function stopStream(stream: MediaStream): void {
  for (const t of stream.getTracks()) t.stop();
}

function waitForFirstFrame(video: HTMLVideoElement): Promise<void> {
  if (video.videoWidth > 0 && video.readyState >= 2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('The camera started but sent no picture.'));
    }, 8000);
    const onReady = () => {
      if (video.videoWidth === 0) return;
      cleanup();
      resolve();
    };
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('resize', onReady);
    };
    video.addEventListener('loadeddata', onReady);
    video.addEventListener('resize', onReady);
  });
}

function toCameraError(err: unknown): CameraError {
  if (err instanceof CameraError) return err;
  const name = err instanceof Error ? err.name : '';
  const detail = err instanceof Error ? ` (${err.name}: ${err.message})` : '';
  let kind: CameraErrorKind = 'unknown';
  if (name === 'NotAllowedError' || name === 'SecurityError') kind = 'denied';
  else if (name === 'NotFoundError' || name === 'OverconstrainedError') kind = 'not-found';
  else if (name === 'NotReadableError' || name === 'AbortError') kind = 'in-use';
  return new CameraError(kind, CAMERA_HELP[kind] + detail);
}
