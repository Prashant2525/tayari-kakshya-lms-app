import { describe, expect, it } from 'vitest';
import { buildStudyPlan, planDayAdd, planDaysBetween, type PlanTask } from './study-plan.js';

const task = (id: string, minutes: number, extra: Partial<PlanTask> = {}): PlanTask => ({
  id,
  minutes,
  done: false,
  ...extra,
});
const ids = (plan: ReturnType<typeof buildStudyPlan>) =>
  plan.days.map((d) => `${d.day.slice(5)}:${d.tasks.map((t) => t.id).join(',')}`);

describe('study planner (S7, D-066)', () => {
  it('spreads unfinished work over the days before the exam, in course order', () => {
    const plan = buildStudyPlan(
      [
        task('a', 20),
        task('b', 30),
        task('c', 40, { done: true, doneDay: '2026-10-01' }),
        task('d', 25),
        task('e', 60),
      ],
      { today: '2026-10-10', examDay: '2026-10-15', minutesPerDay: 60 },
    );
    // a + b fit in 60; d would make 75; e alone takes a day.
    expect(ids(plan)).toEqual(['10-10:a,b', '10-11:d', '10-12:e']);
    expect(plan).toMatchObject({ studyDays: 5, minutesLeft: 135, neededMinutesPerDay: 27, onTrack: true });
    expect(plan.days[0]!.minutes).toBe(50);
  });

  it("keeps today's finished work in today's plan and counts it against today's time", () => {
    const plan = buildStudyPlan(
      [task('a', 40, { done: true, doneDay: '2026-10-10' }), task('b', 30), task('c', 10)],
      { today: '2026-10-10', examDay: '2026-10-20', minutesPerDay: 60 },
    );
    // 40 done + 30 would be 70 > 60: b moves to tomorrow, and c stays after it (order kept).
    expect(ids(plan)).toEqual(['10-10:a', '10-11:b,c']);
    // A day already full keeps only its finished work.
    const full = buildStudyPlan([task('a', 60, { done: true, doneDay: '2026-10-10' }), task('b', 5)], {
      today: '2026-10-10',
      examDay: '2026-10-20',
      minutesPerDay: 60,
    });
    expect(ids(full)).toEqual(['10-10:a', '10-11:b']);
  });

  it('plans a test on the day it opens, without holding up the rest', () => {
    const plan = buildStudyPlan(
      [task('mock', 30, { opensDay: '2026-10-12' }), task('a', 30), task('b', 30), task('c', 30)],
      { today: '2026-10-10', examDay: '2026-10-20', minutesPerDay: 60 },
    );
    expect(ids(plan)).toEqual(['10-10:a,b', '10-11:c', '10-12:mock']);
  });

  it('reports what does not fit and the pace needed when behind', () => {
    const plan = buildStudyPlan(
      [task('a', 50), task('b', 50), task('c', 50), task('late', 30, { opensDay: '2026-10-30' })],
      {
        today: '2026-10-10',
        examDay: '2026-10-12',
        minutesPerDay: 60,
      },
    );
    expect(ids(plan)).toEqual(['10-10:a', '10-11:b']);
    expect(plan.unscheduled.map((t) => t.id)).toEqual(['c', 'late']);
    expect(plan).toMatchObject({ studyDays: 2, minutesLeft: 180, neededMinutesPerDay: 90, onTrack: false });
  });

  it('has nothing to plan on or after the exam day, and an empty today when all is done', () => {
    const after = buildStudyPlan([task('a', 10)], {
      today: '2026-10-10',
      examDay: '2026-10-10',
      minutesPerDay: 60,
    });
    expect(after).toMatchObject({ days: [], studyDays: 0, neededMinutesPerDay: null, onTrack: false });
    const done = buildStudyPlan([task('a', 10, { done: true, doneDay: '2026-10-02' })], {
      today: '2026-10-10',
      examDay: '2026-11-10',
      minutesPerDay: 60,
    });
    expect(done).toMatchObject({ minutesLeft: 0, neededMinutesPerDay: 0, onTrack: true });
    expect(ids(done)).toEqual(['10-10:']);
  });

  it('counts days across month and year ends', () => {
    expect(planDayAdd('2026-12-31', 1)).toBe('2027-01-01');
    expect(planDaysBetween('2027-02-27', '2027-03-01')).toBe(2);
  });
});
