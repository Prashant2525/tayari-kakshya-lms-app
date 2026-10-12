// Weekly-exam burst load test (Phase 16): N students start the same timed test at once, save their answers in a few
// rounds, submit together, then open their results and the leaderboard. Reports latency (p50 / p95 / p99 / max) and
// errors per step. Runs against the throw-away API from start-api.mjs (or a staging API with TRUST_PROXY set and a
// staff account that may create questions and tests — never production).
//
//   node apps/api/scripts/load/weekly-exam.mjs [--api http://localhost:4040] [--students 200] [--questions 50]
//     [--saves 5] [--concurrency 200]
//
// Staff sign-in uses the seeded e2e editor (E2E_EDITOR_EMAIL / E2E_ADMIN_PASSWORD from @tk/e2e-support).
import { parseArgs } from 'node:util';
import { E2E_ADMIN_PASSWORD, E2E_EDITOR_EMAIL } from '../../../../packages/e2e-support/src/accounts.mjs';

const { values } = parseArgs({
  options: {
    api: { type: 'string', default: 'http://localhost:4040' },
    students: { type: 'string', default: '200' },
    questions: { type: 'string', default: '50' },
    saves: { type: 'string', default: '5' },
    concurrency: { type: 'string', default: '200' },
  },
});
const API = `${values.api.replace(/\/+$/, '')}/api/v1`;
const STUDENTS = Number(values.students);
const QUESTIONS = Number(values.questions);
const SAVES = Number(values.saves);
const CONCURRENCY = Number(values.concurrency);
const run = Date.now().toString(36);
const doc = (text) => ({
  en: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
});

/** Each simulated student has its own address, as real students do (per-IP limits). */
const ipOf = (i) => `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`;

async function call(method, path, { token, body, ip, admin } = {}) {
  const started = performance.now();
  let status = 0;
  let json = null;
  try {
    const res = await fetch(API + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(ip ? { 'X-Forwarded-For': ip } : {}),
        ...(admin ? { 'X-TK-Client': 'admin' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    status = res.status;
    const text = await res.text();
    json = text ? JSON.parse(text) : null;
  } catch (err) {
    json = { error: { code: `NETWORK ${err?.cause?.code ?? err?.code ?? ''}`.trim(), message: String(err) } };
  }
  return { status, body: json, ms: performance.now() - started };
}

/** Runs `fn` for every item with at most `limit` in flight. */
async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

const steps = new Map();
function record(step, r, ok) {
  const s = steps.get(step) ?? { ms: [], errors: 0, codes: new Map() };
  s.ms.push(r.ms);
  if (!ok(r)) {
    s.errors++;
    const code = `${r.status} ${r.body?.error?.code ?? ''}`.trim();
    s.codes.set(code, (s.codes.get(code) ?? 0) + 1);
  }
  steps.set(step, s);
}
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;

// ── Set-up (not measured): staff, questions, the test, students ──
const staff = await call('POST', '/admin/auth/login', {
  admin: true,
  body: { email: E2E_EDITOR_EMAIL, password: E2E_ADMIN_PASSWORD },
});
if (staff.status !== 200) throw new Error(`staff sign-in failed: ${JSON.stringify(staff.body)}`);
const s = { token: staff.body.accessToken, admin: true };
const must = (r, what) => {
  if (r.status >= 300) throw new Error(`${what}: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const subject = must(
  await call('POST', '/admin/subjects', { ...s, body: { name: { en: `Load ${run}` } } }),
  'subject',
);
must(
  await call('PUT', `/admin/subjects/${subject.id}/status`, { ...s, body: { status: 'published' } }),
  'publish subject',
);
const questionIds = await pool(Array.from({ length: QUESTIONS }), 10, async (_, i) => {
  const q = must(
    await call('POST', '/admin/questions', {
      ...s,
      body: {
        subjectId: subject.id,
        difficulty: 'medium',
        defaultMarks: 1,
        defaultNegativeMarks: 0,
        accessLevel: 'free',
        tags: [],
        content: {
          type: 'single_choice',
          stem: doc(`Load question ${i + 1}`),
          options: ['a', 'b', 'c', 'd'].map((id) => ({ id, content: doc(`Option ${id}`) })),
          correctOptionId: 'b',
        },
      },
    }),
    'question',
  );
  must(
    await call('PUT', `/admin/questions/${q.id}/status`, { ...s, body: { status: 'published' } }),
    'publish',
  );
  return q.id;
});
const test = must(
  await call('POST', '/admin/assessments', {
    ...s,
    body: {
      type: 'subject_test',
      title: { en: `Weekly exam load ${run}` },
      subjectId: subject.id,
      accessLevel: 'free',
      availability: 'always',
      durationMinutes: 60,
      maxAttempts: 1,
      passMarks: null,
      scoring: {
        negativeMarking: false,
        multipleChoice: 'all_or_nothing',
        match: 'all_or_nothing',
        fillBlank: 'all_or_nothing',
        scoreFloor: 'zero',
      },
      shuffleQuestions: true,
      shuffleOptions: true,
      resultRelease: 'immediate',
      showExplanations: true,
      leaderboardEnabled: true,
      subjectiveGrading: 'none',
    },
  }),
  'assessment',
);
must(
  await call('PUT', `/admin/assessments/${test.id}/structure`, {
    ...s,
    body: { sections: [{ pickMode: 'fixed', questions: questionIds.map((questionId) => ({ questionId })) }] },
  }),
  'structure',
);
must(
  await call('PUT', `/admin/assessments/${test.id}/publishing`, { ...s, body: { status: 'published' } }),
  'publish test',
);

console.log(`Creating ${STUDENTS} students (password hashing makes this the slow part)…`);
const students = (
  await pool(Array.from({ length: STUDENTS }), 20, async (_, i) => {
    const r = await call('POST', '/auth/register', {
      ip: ipOf(i + 1),
      body: {
        fullName: `Load Student ${i + 1}`,
        email: `load-${run}-${i + 1}@example.com`,
        password: 'load test password',
        acceptTerms: true,
        device: { deviceId: `load-${run}-${i + 1}`, deviceName: 'Load', platform: 'android' },
      },
    });
    return r.status === 201 || r.status === 200 ? { token: r.body.accessToken, ip: ipOf(i + 1) } : null;
  })
).filter(Boolean);
console.log(`${students.length} students ready; ${questionIds.length} questions. Starting the burst.\n`);

// ── Measured: everyone at once ──
const wall = performance.now();
const ok2 = (r) => r.status >= 200 && r.status < 300;
const attempts = await pool(students, CONCURRENCY, async (st) => {
  const r = await call('POST', `/assessments/${test.id}/attempts`, st);
  record('1. start attempt', r, ok2);
  return ok2(r) ? r.body : null;
});
for (let round = 0; round < SAVES; round++) {
  await pool(students, CONCURRENCY, async (st, i) => {
    const a = attempts[i];
    if (!a) return;
    const qs = a.sections.flatMap((x) => x.questions);
    const per = Math.ceil(qs.length / SAVES);
    const answers = qs.slice(round * per, (round + 1) * per).map((q) => ({
      questionId: q.questionId,
      response: { type: 'single_choice', optionId: q.question.options[i % q.question.options.length].id },
      markedForReview: false,
    }));
    if (!answers.length) return;
    record(
      '2. save answers',
      await call('PUT', `/attempts/${a.id}/answers`, { ...st, body: { answers } }),
      ok2,
    );
  });
}
await pool(students, CONCURRENCY, async (st, i) => {
  const a = attempts[i];
  if (!a) return;
  record('3. submit', await call('POST', `/attempts/${a.id}/submit`, st), ok2);
});
await pool(students, CONCURRENCY, async (st, i) => {
  const a = attempts[i];
  if (!a) return;
  record('4. result', await call('GET', `/attempts/${a.id}/result`, st), ok2);
  record('5. leaderboard', await call('GET', `/assessments/${test.id}/leaderboard`, st), ok2);
});
const seconds = (performance.now() - wall) / 1000;

// ── Report ──
let total = 0;
let failed = 0;
console.log('step               requests  errors   p50 ms   p95 ms   p99 ms   max ms');
for (const [name, st] of steps) {
  const sorted = [...st.ms].sort((x, y) => x - y);
  total += sorted.length;
  failed += st.errors;
  const f = (n) => String(Math.round(n)).padStart(8);
  console.log(
    `${name.padEnd(18)} ${String(sorted.length).padStart(8)} ${String(st.errors).padStart(7)} ${f(pct(sorted, 50))} ${f(pct(sorted, 95))} ${f(pct(sorted, 99))} ${f(sorted.at(-1) ?? 0)}`,
  );
  for (const [code, n] of st.codes) console.log(`    ${n} × ${code}`);
}
console.log(
  `\n${total} requests in ${seconds.toFixed(1)} s (${(total / seconds).toFixed(0)}/s), ${failed} errors.`,
);
if (failed) process.exitCode = 1;
