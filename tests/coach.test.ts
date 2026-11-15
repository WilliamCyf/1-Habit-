import { describe, expect, it } from 'vitest';
import { SpeechQueue } from '../src/coach/queue';
import { Governor } from '../src/perf/governor';

/** A fake voice we fully control: records what was said and lets us end each line by hand. */
function fakeVoice() {
  const said: string[] = [];
  const endings: (() => void)[] = [];
  let clock = 0;
  const queue = new SpeechQueue(
    (text) =>
      new Promise<void>((resolve) => {
        said.push(text);
        endings.push(resolve);
      }),
    () => clock,
  );
  return {
    queue,
    said,
    /** Finish the line being spoken and let the queue react. */
    async finish() {
      endings.shift()?.();
      await Promise.resolve();
      await Promise.resolve();
    },
    tick(ms: number) {
      clock += ms;
    },
  };
}

describe('SpeechQueue', () => {
  it('speaks straight away when silent', () => {
    const v = fakeVoice();
    v.queue.say('One', 'count');
    expect(v.said).toEqual(['One']);
  });

  it('keeps only the newest count while busy, so it never falls behind', async () => {
    const v = fakeVoice();
    v.queue.say('Get into position', 'info');
    v.queue.say('1', 'count');
    v.queue.say('2', 'count');
    v.queue.say('3', 'count');
    v.tick(400);
    await v.finish();
    expect(v.said).toEqual(['Get into position', '3']);
  });

  it('drops a count that has gone stale instead of saying it late', async () => {
    const v = fakeVoice();
    v.queue.say('A long sentence', 'info');
    v.queue.say('4', 'count');
    v.tick(3000);
    await v.finish();
    expect(v.said).toEqual(['A long sentence']);
    expect(v.queue.isBusy).toBe(false);
  });

  it('does not let a small tip push out a rep count', async () => {
    const v = fakeVoice();
    v.queue.say('Go!', 'info');
    v.queue.say('5', 'count');
    v.queue.say('Hips up', 'cue');
    await v.finish();
    expect(v.said).toEqual(['Go!', '5']);
  });

  it('lets important information replace a waiting tip', async () => {
    const v = fakeVoice();
    v.queue.say('1', 'count');
    v.queue.say('Hips up', 'cue');
    v.queue.say('Set complete', 'info');
    await v.finish();
    expect(v.said).toEqual(['1', 'Set complete']);
  });

  it('carries on after a speech error', async () => {
    const said: string[] = [];
    const queue = new SpeechQueue((text) => {
      said.push(text);
      return text === 'boom' ? Promise.reject(new Error('x')) : Promise.resolve();
    });
    queue.say('boom', 'info');
    await Promise.resolve();
    await Promise.resolve();
    queue.say('after', 'info');
    expect(said).toEqual(['boom', 'after']);
  });

  it('can be cleared', async () => {
    const v = fakeVoice();
    v.queue.say('1', 'count');
    v.queue.say('2', 'count');
    v.queue.clear();
    await v.finish();
    expect(v.said).toEqual(['1']);
  });
});

describe('Governor', () => {
  /** Feed `seconds` of looks that each take `ms`. Returns every speed change. */
  function run(g: Governor, startSec: number, seconds: number, ms: number): number[] {
    const changes: number[] = [];
    for (let t = startSec * 1000; t < (startSec + seconds) * 1000; t += 1000 / g.fps) {
      const change = g.push(ms, t);
      if (change !== null) changes.push(change);
    }
    return changes;
  }

  it('stays at full speed on a comfortable phone', () => {
    const g = new Governor();
    expect(run(g, 0, 120, 19)).toEqual([]);
    expect(g.fps).toBe(15);
  });

  it('ignores a single slow look', () => {
    const g = new Governor();
    run(g, 0, 10, 19);
    g.push(400, 10_000);
    expect(run(g, 10, 20, 19)).toEqual([]);
    expect(g.fps).toBe(15);
  });

  it('steps down, one step at a time, when looks stay slow', () => {
    const g = new Governor();
    const changes = run(g, 0, 30, 60);
    expect(changes).toEqual([12, 10]);
    expect(g.fps).toBe(10);
    expect(g.steppedDown).toBe(true);
  });

  it('never goes below the slowest level', () => {
    const g = new Governor();
    run(g, 0, 120, 90);
    expect(g.fps).toBe(10);
  });

  it('recovers only after a long calm spell', () => {
    const g = new Governor();
    run(g, 0, 8, 60);
    expect(g.fps).toBe(12);
    expect(run(g, 8, 10, 20)).toEqual([]); // 10 calm seconds: not yet
    expect(run(g, 18, 30, 20)).toEqual([15]);
  });

  it('does not flap when the load sits in the middle', () => {
    const g = new Governor();
    run(g, 0, 6, 60);
    expect(run(g, 6, 120, 35)).toEqual([]); // neither slow nor calm
    expect(g.fps).toBe(12);
  });
});
