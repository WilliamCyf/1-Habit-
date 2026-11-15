/**
 * Decides what the coach says next when several things want saying at once.
 *
 * Speech is slow compared with push-ups: saying "seven, go lower" takes
 * about a second. If we simply queued everything, the coach would fall
 * behind and announce "four" while you finish rep six. So the rule is:
 *
 *  - Nothing playing? Say it now.
 *  - Something playing? Keep only ONE waiting line. A newer or more
 *    important line replaces it.
 *  - A waiting line that has gone stale is dropped, never said late.
 *
 * Like a radio commentator: describe what is happening now, skip what you missed.
 */
export type LineKind = 'cue' | 'count' | 'info';

const PRIORITY: Record<LineKind, number> = { cue: 1, count: 2, info: 3 };
/** How long a waiting line stays worth saying, in milliseconds. */
const SHELF_LIFE: Record<LineKind, number> = { cue: 2000, count: 1300, info: 15000 };

interface Waiting {
  text: string;
  kind: LineKind;
  at: number;
}

export class SpeechQueue {
  private busy = false;
  private waiting: Waiting | null = null;

  /**
   * @param speakNow  actually speaks; resolves when the speech has ended
   * @param now       the clock (passed in so tests can control time)
   */
  constructor(
    private readonly speakNow: (text: string) => Promise<unknown>,
    private readonly now: () => number = () => performance.now(),
  ) {}

  say(text: string, kind: LineKind): void {
    if (!text) return;
    if (!this.busy) {
      this.play(text);
      return;
    }
    if (!this.waiting || PRIORITY[kind] >= PRIORITY[this.waiting.kind]) {
      this.waiting = { text, kind, at: this.now() };
    }
  }

  /** Forget anything waiting (used when a set ends or pauses). */
  clear(): void {
    this.waiting = null;
  }

  get isBusy(): boolean {
    return this.busy;
  }

  private play(text: string): void {
    this.busy = true;
    const done = () => {
      this.busy = false;
      const next = this.waiting;
      this.waiting = null;
      if (next && this.now() - next.at <= SHELF_LIFE[next.kind]) this.play(next.text);
    };
    this.speakNow(text).then(done, done);
  }
}
