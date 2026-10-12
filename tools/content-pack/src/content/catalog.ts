import type { Names } from '../types.ts';

/**
 * Everything around the courses in the university content pack (D-071): exam categories, prices, plans, coupons,
 * notices and articles. Prices and test rules are the owner's choices (D-071); all of it is editable in the CMS.
 */

/** Category types: University → Program → Semester (a child ranks below its parent). */
export const categoryTypes = [
  { key: 'university', name: { en: 'University', ne: 'विश्वविद्यालय' }, rank: 100, topLevel: true },
  { key: 'program', name: { en: 'Program', ne: 'कार्यक्रम' }, rank: 110, topLevel: false },
  { key: 'semester', name: { en: 'Semester', ne: 'सेमेस्टर' }, rank: 120, topLevel: false },
] as const;

export interface PackCategory {
  key: string;
  parent: string | null;
  type: (typeof categoryTypes)[number]['key'];
  slug: string;
  name: Names;
  description: Names;
}

export const categories: PackCategory[] = [
  {
    key: 'engineering-university',
    parent: null,
    type: 'university',
    slug: 'engineering-university',
    name: { en: 'Engineering University', ne: 'इन्जिनियरिङ विश्वविद्यालय' },
    description: { en: 'University engineering programmes.', ne: 'विश्वविद्यालयका इन्जिनियरिङ कार्यक्रम।' },
  },
  {
    key: 'btech-cse',
    parent: 'engineering-university',
    type: 'program',
    slug: 'btech-cse',
    name: { en: 'B.Tech Computer Science & Engineering', ne: 'बि.टेक कम्प्युटर विज्ञान तथा इन्जिनियरिङ' },
    description: {
      en: 'Bachelor of Technology in Computer Science and Engineering.',
      ne: 'कम्प्युटर विज्ञान तथा इन्जिनियरिङमा स्नातक (बि.टेक)।',
    },
  },
  ...(
    [
      ['semester-1', 'Semester 1', 'पहिलो सेमेस्टर'],
      ['semester-5', 'Semester 5', 'पाँचौँ सेमेस्टर'],
      ['semester-6', 'Semester 6', 'छैटौँ सेमेस्टर'],
      ['semester-7', 'Semester 7', 'सातौँ सेमेस्टर'],
    ] as const
  ).map(([key, en, ne]) => ({
    key,
    parent: 'btech-cse',
    type: 'semester' as const,
    slug: `btech-cse-${key}`,
    name: { en, ne },
    description: { en: `B.Tech CSE — ${en}.`, ne: `बि.टेक CSE — ${ne}।` },
  })),
];

/** D-071: every course Rs 799 for a year, on a 25% launch sale at Rs 599 (no end date set; staff end it in the CMS). */
export const coursePricing = {
  pricePaisa: 79_900,
  salePricePaisa: 59_900,
  saleStartsAt: null,
  saleEndsAt: null,
  validityType: 'days' as const,
  validityDays: 365,
  validityEndsOn: null,
};

export interface PackPlan {
  slug: string;
  name: Names;
  description: Names;
  features: Names[];
  coverage: 'all_courses' | 'selected';
  /** Course keys (for `selected`). */
  courses: string[];
  isFeatured: boolean;
  sortOrder: number;
  pricePaisa: number;
}

export const plans: PackPlan[] = [
  {
    slug: 'cse-semester-pack',
    name: { en: 'CSE Semester Pack', ne: 'CSE सेमेस्टर प्याक' },
    description: {
      en: 'The four computer-science courses for one year.',
      ne: 'कम्प्युटर विज्ञानका चार कोर्स, एक वर्षका लागि।',
    },
    features: [
      {
        en: 'Operating Systems, Software Engineering, Deep Learning and Multimedia',
        ne: 'अपरेटिङ सिस्टम, सफ्टवेयर इन्जिनियरिङ, डिप लर्निङ र मल्टिमिडिया',
      },
      {
        en: 'All notes and PDF handouts, readable offline',
        ne: 'सबै नोट र PDF ह्यान्डआउट, अफलाइन पनि पढ्न मिल्ने',
      },
      { en: 'Chapter quizzes and timed subject tests', ne: 'अध्याय क्विज र समयबद्ध विषय परीक्षा' },
      { en: 'Valid for 365 days', ne: '३६५ दिनसम्म मान्य' },
    ],
    coverage: 'selected',
    courses: ['os', 'se', 'dl', 'mm'],
    isFeatured: false,
    sortOrder: 1,
    pricePaisa: 199_900,
  },
  {
    slug: 'all-access',
    name: { en: 'All Access', ne: 'सबै पहुँच' },
    description: {
      en: 'Every course on Tayari Kakshya for one year.',
      ne: 'तयारी कक्षाका सबै कोर्स, एक वर्षका लागि।',
    },
    features: [
      {
        en: 'Every course, including new ones added during the year',
        ne: 'वर्षभरि थपिने नयाँ कोर्ससहित सबै कोर्स',
      },
      { en: 'All notes, PDF handouts and question banks', ne: 'सबै नोट, PDF ह्यान्डआउट र प्रश्न बैंक' },
      { en: 'All quizzes and subject tests with leaderboards', ne: 'लिडरबोर्डसहित सबै क्विज र विषय परीक्षा' },
      { en: 'Valid for 365 days', ne: '३६५ दिनसम्म मान्य' },
    ],
    coverage: 'all_courses',
    courses: [],
    isFeatured: true,
    sortOrder: 2,
    pricePaisa: 249_900,
  },
];

export const coupons = [
  {
    code: 'WELCOME20',
    note: 'Welcome offer: 20% off (up to Rs 300), once per student. University content pack (D-071).',
    discountType: 'percent' as const,
    percentBps: 2_000,
    amountPaisa: null,
    maxDiscountPaisa: 30_000,
    minOrderPaisa: null,
    startsAt: null,
    endsAt: null,
    maxRedemptions: null,
    perUserLimit: 1,
    appliesTo: 'everything' as const,
    courseIds: [],
    planIds: [],
    allowOnSale: true,
    active: true,
  },
  {
    code: 'STUDY100',
    note: 'Rs 100 off any order of Rs 500 or more. University content pack (D-071).',
    discountType: 'fixed' as const,
    percentBps: null,
    amountPaisa: 10_000,
    maxDiscountPaisa: null,
    minOrderPaisa: 50_000,
    startsAt: null,
    endsAt: null,
    maxRedemptions: null,
    perUserLimit: null,
    appliesTo: 'everything' as const,
    courseIds: [],
    planIds: [],
    allowOnSale: true,
    active: true,
  },
];

export interface PackNotice {
  key: string;
  kind: 'official' | 'announcement' | 'instructor';
  title: Names;
  body: string;
  isPinned: boolean;
}

export const notices: PackNotice[] = [
  {
    key: 'welcome-university-courses',
    kind: 'announcement',
    title: { en: 'New: five university courses are live', ne: 'नयाँ: विश्वविद्यालयका पाँच कोर्स सुरु' },
    body: `
**Introductory Biology, Operating Systems, Software Engineering, Deep Learning and Introduction to Multimedia** are now available for B.Tech CSE students.

- Clear notes for every topic, with tables and worked examples
- A PDF handout for every chapter — save it and read offline
- Chapter quizzes and a timed subject test for each course

The **first chapter of every course is free**. Open the Courses tab to start.
`,
    isPinned: true,
  },
  {
    key: 'launch-offer',
    kind: 'announcement',
    title: { en: 'Launch offer: 25% off every course', ne: 'सुरुआती छुट: हरेक कोर्समा २५% छुट' },
    body: `
For a limited time every course is **Rs 599 instead of Rs 799** (one year of access).

New here? Use the coupon **WELCOME20** for a further 20% off your first purchase (up to Rs 300).

Prefer everything? The **All Access** plan covers every course for a year.
`,
    isPinned: false,
  },
  {
    key: 'subject-tests-open',
    kind: 'instructor',
    title: { en: 'Subject tests are open — test yourself', ne: 'विषय परीक्षा खुला — आफैँलाई जाँच्नुहोस्' },
    body: `
Each course now has a **30-minute subject test** of 20 questions drawn from its question bank. There is no negative marking, the pass mark is 40%, and your **best attempt** counts on the leaderboard.

Tip: finish the chapter quizzes first — they use the same kinds of questions, and each answer comes with an explanation.
`,
    isPinned: false,
  },
  {
    key: 'offline-reading',
    kind: 'announcement',
    title: { en: 'Read your notes and PDFs offline', ne: 'नोट र PDF अफलाइन पढ्नुहोस्' },
    body: `
Tap the **cloud button** on any note or PDF handout to save it to your phone. Saved lessons open **without internet** and are renewed whenever you are online. Find them under **Profile → Downloads**.
`,
    isPinned: false,
  },
];

export interface PackArticle {
  slug: string;
  title: Names;
  summary: Names;
  body: string;
  isFeatured: boolean;
}

export const articles: PackArticle[] = [
  {
    slug: 'how-to-prepare-for-semester-exams',
    title: {
      en: 'How to prepare for semester exams: a four-week plan',
      ne: 'सेमेस्टर परीक्षाको तयारी: चार हप्ताको योजना',
    },
    summary: {
      en: 'A simple, week-by-week plan to cover the syllabus, practise questions and revise without last-minute panic.',
      ne: 'पाठ्यक्रम सक्ने, प्रश्न अभ्यास गर्ने र अन्तिम समयको आत्तिनबाट बच्ने हप्तागत सजिलो योजना।',
    },
    isFeatured: true,
    body: `
Semester exams reward steady work more than all-night cramming. Here is a four-week plan that fits around classes.

## Week 1 — map the syllabus
- List every unit and topic from your syllabus, and mark the ones you find hardest.
- Look at two or three previous question papers: which topics come up again and again?
- Use the **study planner** in the app: choose your course and exam date, and it spreads the lessons across the days you have.

## Week 2 — learn, then test
- Study one or two topics a day from the notes. After each chapter, take the **chapter quiz**.
- Read the explanation for every question you get wrong, and add hard questions to your **saved** list.

## Week 3 — practise like the exam
- Write answers to long questions by hand, with a timer — definitions, diagrams and points.
- Take the timed **subject test**. Note the topics where you lose marks and go back to their notes.

## Week 4 — revise
- Use the **Key points** section at the end of each chapter handout for quick revision.
- Re-take the subject test; your best attempt counts.
- Sleep properly the night before. A rested brain recalls far more than a tired one.

> **Rule of thumb:** if you can explain a topic in your own words to a friend, you are ready for it in the exam.
`,
  },
  {
    slug: 'deep-learning-roadmap-for-beginners',
    title: { en: "A beginner's roadmap to deep learning", ne: 'डिप लर्निङ सिक्ने सुरुआती मार्गचित्र' },
    summary: {
      en: 'What to learn first, in what order, and how to practise — from Python basics to your first neural network.',
      ne: 'पहिले के सिक्ने, कुन क्रममा र कसरी अभ्यास गर्ने — Python देखि पहिलो न्युरल नेटवर्कसम्म।',
    },
    isFeatured: false,
    body: `
Deep learning looks intimidating, but it builds on a few ideas you can learn one at a time.

## 1. Python and NumPy
Be comfortable with lists, functions and loops, then **NumPy** arrays — almost every ML library works with them.

## 2. Just enough maths
- **Linear algebra:** vectors, matrices, the dot product.
- **Calculus:** derivatives and the **chain rule** — the heart of backpropagation.
- **Probability:** conditional probability and Bayes' theorem.

## 3. Classical machine learning
Learn **linear and logistic regression** with scikit-learn. Understand **training vs test data**, **overfitting**, and loss functions such as MSE and cross-entropy.

## 4. Gradient descent
Work one iteration by hand, then write the loop yourself in a few lines of Python. Once you see the parameters move towards the answer, the rest makes sense.

## 5. Neural networks with Keras
Build a small network on **MNIST**: Flatten → Dense(ReLU) → Dense(softmax). Watch training in **TensorBoard**.

## 6. Go deeper
Convolutional networks for images, recurrent networks and LSTMs for sequences, then transformers.

> Our **Deep Learning Foundations** course covers steps 3 to 5 with worked examples and labs.
`,
  },
  {
    slug: 'operating-system-ideas-every-engineer-should-know',
    title: {
      en: '10 operating-system ideas every engineer should know',
      ne: 'हरेक इन्जिनियरले जान्नुपर्ने अपरेटिङ सिस्टमका १० कुरा',
    },
    summary: {
      en: 'Interrupts, system calls, dual mode, scheduling and more — the core OS ideas, each in one paragraph.',
      ne: 'इन्टरप्ट, सिस्टम कल, डुअल मोड, शेड्युलिङ लगायत OS का मूल कुरा, हरेक एक अनुच्छेदमा।',
    },
    isFeatured: false,
    body: `
1. **The OS is a resource allocator.** It decides which program gets the CPU, memory and devices, and when.
2. **Booting.** A small bootstrap program in firmware loads the kernel into memory.
3. **Interrupts.** Devices and programs signal events; the CPU saves its state, runs the handler, and resumes.
4. **System calls.** Programs ask the OS for services — reading files, creating processes — through system calls, usually via an API such as POSIX.
5. **Dual mode.** User mode is restricted; kernel mode is privileged. A mode bit keeps buggy apps from touching hardware directly.
6. **The timer.** A timer interrupt guarantees the OS gets control back, even from a program stuck in a loop.
7. **Multiprogramming.** Several programs in memory keep the CPU busy while one waits for I/O.
8. **Time-sharing.** Switching every few milliseconds lets many users — or many apps — feel they have the machine to themselves.
9. **The storage hierarchy.** Registers, cache, RAM, SSD, disk: each level trades speed for size and cost.
10. **DMA.** Devices move whole blocks of data to memory without the CPU, interrupting once when done.

> Learn each of these properly in our **Operating Systems** course — the first chapter is free.
`,
  },
];

/** Practice tests (D-071): 1 mark per question, no negative marking, pass mark 40%. */
export const testRules = {
  marksPerQuestion: 1,
  passFraction: 0.4,
  subjectTest: { questionCount: 20, durationMinutes: 30 },
};
