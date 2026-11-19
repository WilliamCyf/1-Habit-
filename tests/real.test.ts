// The push-up counter's exam on REAL people.
//
// Each fixture is a real video run through the app's own pose model (see
// scripts/extract-fixtures.mjs). The reps were counted by hand. This is the
// test that matters most: the earlier counter passed every simulated test
// and still counted zero reps on every one of these videos.
import { describe, expect, it } from 'vitest';
import { PushupDetector } from '../src/detectors/pushup';
import type { Detector, DetectorEvent, RejectEvent, RepEvent } from '../src/detectors/types';
import { EXERCISES } from '../src/exercises/library';
import { fixtureIds, loadFixture, type Fixture } from './helpers/fixtures';

interface Result {
  reps: RepEvent[];
  rejects: RejectEvent[];
  readyAt: number | null;
  facing: string | null;
}

/**
 * Play a recording as the app does: wait for the held start position, then
 * count. Stock clips rarely hold still at the start, so for the counting
 * exam we also run "already counting" from the first frame.
 */
function play(fx: Fixture, mode: 'gate' | 'immediate'): Result {
  const d = new PushupDetector();
  const events: DetectorEvent[] = [];
  let readyAt: number | null = null;
  if (mode === 'immediate') d.startCounting();
  fx.frames.forEach((f, i) => {
    events.push(...d.update(f));
    if (mode === 'gate' && readyAt === null && d.view.ready) {
      readyAt = i;
      d.startCounting();
    }
  });
  return {
    reps: events.filter((e): e is RepEvent => e.type === 'rep'),
    rejects: events.filter((e): e is RejectEvent => e.type === 'reject'),
    readyAt,
    facing: d.facing,
  };
}

const labelled = fixtureIds()
  .map(loadFixture)
  .filter((fx) => fx.exercise === 'pushup' && fx.accept);


describe('push-ups on real videos', () => {
  it('does not nag good push-ups: full-depth, straight-armed reps hear no "go lower" or "straighten your arms"', () => {
    // Checked by eye on the videos: these people go deep and lock out. The
    // tracker under-reads straight elbows (125-140 degrees), so the tips must allow for it.
    for (const id of ['24273', '24277', '32308', '32320', '50761']) {
      const cues = play(loadFixture(id), 'immediate').reps.map((r) => r.cue);
      expect(cues.filter((c) => c === 'go-lower' || c === 'lock-out'), `${id}: ${cues.join(',')}`).toEqual([]);
    }
  });

  it('still mentions raised hips side-on, where it can be seen (checked by eye)', () => {
    for (const id of ['11544', '50762']) expect(play(loadFixture(id), 'immediate').reps.some((r) => r.cue === 'hips-down'), id).toBe(true);
  });

  it.each(labelled.map((fx) => [fx.id, fx.view, fx.reps, fx] as const))('%s (%s view): about %i reps', (_id, _view, _reps, fx) => {
    const r = play(fx, 'immediate');
    const [lo, hi] = fx.accept!;
    expect(r.reps.length, `${fx.title}: counted ${r.reps.length}, rejects ${r.rejects.map((x) => x.reason).join(',')}`).toBeGreaterThanOrEqual(lo);
    expect(r.reps.length).toBeLessThanOrEqual(hi);
  });

  it('works facing the camera: every front-view clip counts reps', () => {
    for (const fx of labelled.filter((f) => f.view === 'front')) expect(play(fx, 'immediate').reps.length, fx.id).toBeGreaterThan(0);
  });

  it('opens the start gate on real people holding the top, and recognises the view', () => {
    // Clips where the person holds the top still for a moment, as the app
    // asks. (Several stock clips never pause, so they never open the gate:
    // that is correct.)
    const expected: Record<string, string> = { '24273': 'front', '24277': 'front', '24383': 'front', '32320': 'side', '50762': 'side' };
    for (const [id, facing] of Object.entries(expected)) {
      const r = play(loadFixture(id), 'gate');
      expect(r.readyAt, `${id} never became ready`).not.toBeNull();
      expect(r.facing, id).toBe(facing);
    }
  });

  it('after the start gate, counts the reps that follow it', () => {
    // [clip, reps after the gate opened]
    for (const [id, lo, hi] of [['24273', 3, 3], ['24277', 8, 10], ['32320', 5, 5], ['50762', 5, 6]] as const) {
      const n = play(loadFixture(id), 'gate').reps.length;
      expect(n, id).toBeGreaterThanOrEqual(lo);
      expect(n, id).toBeLessThanOrEqual(hi);
    }
  });

  it('counts nothing when the person is running, not doing push-ups', () => {
    const fx = loadFixture('32809');
    expect(play(fx, 'immediate').reps).toHaveLength(0);
    expect(play(fx, 'gate').readyAt).toBeNull();
  });

  it('does nothing silly when the phone is far too close', () => {
    const r = play(loadFixture('5048'), 'immediate');
    expect(r.reps.length).toBeLessThanOrEqual(6);
  });

  it('gives real reps decent form scores', () => {
    for (const id of ['50761', '32320', '11545']) {
      const r = play(loadFixture(id), 'immediate');
      for (const rep of r.reps) expect(rep.score, `${id} rep ${rep.count}`).toBeGreaterThanOrEqual(60);
    }
  });
});

/** Squats are counted the way the app does it: after you stand still at the start. */
function afterGate(d: Detector, fx: Fixture): { reps: number; ready: boolean } {
  let ready = false;
  let reps = 0;
  for (const f of fx.frames) {
    reps += d.update(f).filter((e) => e.type === 'rep').length;
    if (!ready && d.view.ready) {
      ready = true;
      d.startCounting();
    }
  }
  return { reps, ready };
}

const squats = fixtureIds()
  .map(loadFixture)
  .filter((fx) => fx.exercise === 'squat');

describe('squats on real videos', () => {
  it('the earlier squat counter failed every face-on clip (kept as a reminder of why these tests exist)', () => {
    expect(squats.filter((fx) => fx.view === 'front').length).toBeGreaterThanOrEqual(4);
  });

  it.each(squats.map((fx) => [fx.id, fx.view, fx] as const))('%s (%s view): counts the squats after the start gate', (_id, _view, fx) => {
    for (const level of [1, 2] as const) {
      const r = afterGate(EXERCISES.squat.detector(level), fx);
      const [lo, hi] = fx.accept!;
      expect(r.ready, `${fx.id} never stood still`).toBe(true);
      expect(r.reps, `${fx.title}, level ${level}`).toBeGreaterThanOrEqual(lo);
      expect(r.reps, `${fx.title}, level ${level}`).toBeLessThanOrEqual(hi);
    }
  });

  it('a person running towards the camera is not doing squats', () => {
    expect(afterGate(EXERCISES.squat.detector(2), loadFixture('32809')).reps).toBe(0);
  });

  it('push-up videos never count as squats, and squat videos never count as push-ups', () => {
    for (const fx of fixtureIds().map(loadFixture)) {
      if (fx.exercise === 'pushup') expect(afterGate(EXERCISES.squat.detector(2), fx).reps, fx.id).toBe(0);
      if (fx.exercise === 'squat') expect(afterGate(EXERCISES.pushup.detector(2), fx).reps, fx.id).toBe(0);
    }
  });
});
