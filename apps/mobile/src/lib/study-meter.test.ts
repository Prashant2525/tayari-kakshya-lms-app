import { describe, expect, it } from 'vitest';
import { StudyMeter } from './study-meter';

const S = 1000;

describe('study time meter (D-066)', () => {
  it('counts reading while the student is active and stops after the idle limit', () => {
    const m = new StudyMeter();
    const id = m.open('reading', 0);
    m.signal('touch', 50 * S);
    // 50 s, then 120 s of grace after the last touch, then nothing.
    expect(m.drain(400 * S)).toEqual([{ activity: 'reading', seconds: 170 }]);
    // A touch starts the count again.
    m.signal('touch', 500 * S);
    m.close(id, 530 * S);
    expect(m.drain(600 * S)).toEqual([{ activity: 'reading', seconds: 30 }]);
    // Closed: nothing more counts, whatever happens.
    m.signal('touch', 700 * S);
    expect(m.drain(900 * S)).toEqual([]);
  });

  it('counts a video only while it plays, not for touches', () => {
    const m = new StudyMeter();
    m.open('video', 0);
    for (let t = 10; t <= 100; t += 10) m.signal('media', t * S);
    // Paused at 100 s: 30 s of grace, touches do not extend it.
    m.signal('touch', 120 * S);
    m.signal('touch', 200 * S);
    expect(m.drain(300 * S)).toEqual([{ activity: 'video', seconds: 130 }]);
  });

  it('counts only the innermost screen, and nothing in the background', () => {
    const m = new StudyMeter();
    const practice = m.open('practice', 0);
    m.signal('touch', 20 * S);
    const test = m.open('test', 30 * S);
    m.signal('touch', 90 * S);
    m.setForeground(false, 100 * S);
    // In the background for 10 minutes.
    m.setForeground(true, 700 * S);
    m.signal('touch', 710 * S);
    m.close(test, 720 * S);
    m.close(practice, 750 * S);
    expect(m.drain(800 * S).sort((a, b) => a.activity.localeCompare(b.activity))).toEqual([
      // 0–30 s practice, then 30 s more after the test closed.
      { activity: 'practice', seconds: 60 },
      // 30–100 s and 700–720 s.
      { activity: 'test', seconds: 90 },
    ]);
  });

  it('keeps fractions and gives back time that could not be sent', () => {
    const m = new StudyMeter();
    m.open('practice', 0);
    m.signal('touch', 1500);
    expect(m.drain(2500)).toEqual([{ activity: 'practice', seconds: 2 }]);
    expect(m.drain(3000)).toEqual([{ activity: 'practice', seconds: 1 }]);
    m.restore('practice', 40);
    expect(m.drain(3000)).toEqual([{ activity: 'practice', seconds: 40 }]);
    // At most an hour waits to be sent.
    m.restore('reading', 99_999);
    expect(m.drain(3000)).toEqual([{ activity: 'reading', seconds: 3600 }]);
  });
});
