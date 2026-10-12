import { blank, match, mcq, multi, num, subj, tf } from '../questions.ts';
import type { PackCourse } from '../types.ts';

/** Software Engineering, Units 1–2 (B.Tech CSE, Semester 5): original notes and questions (D-071). */
export const softwareEngineering: PackCourse = {
  key: 'se',
  slug: 'software-engineering',
  title: { en: 'Software Engineering', ne: 'सफ्टवेयर इन्जिनियरिङ' },
  shortDescription: {
    en: 'Software and its process, life-cycle models from waterfall to agile, and requirements engineering with the SRS.',
    ne: 'सफ्टवेयर र यसको प्रक्रिया, वाटरफलदेखि एजाइलसम्मका जीवनचक्र मोडेल, र SRS सहित आवश्यकता इन्जिनियरिङ।',
  },
  description: `
## What you will learn
The first two units of a university Software Engineering paper, written as clear, exam-ready notes:

- What software is, why it fails, and what software engineering adds
- The software process: framework and umbrella activities
- Life-cycle models — waterfall, V, prototyping, incremental, evolutionary, RAD, unified process, spiral
- Agile development, Extreme Programming and Scrum
- Requirements engineering: functional and non-functional requirements, the SRS (IEEE 830), gathering and analysis, decision trees and tables

Every chapter has a **PDF handout**, a **quiz**, and the course ends with a timed **subject test**.

> The first chapter is free.
`,
  semester: 'semester-5',
  isFeatured: true,
  popularityRank: 2,
  subject: {
    key: 'se-subject',
    name: { en: 'Software Engineering', ne: 'सफ्टवेयर इन्जिनियरिङ' },
    summary: {
      en: 'Unit 1: software, process and life-cycle models, agile. Unit 2: requirements engineering.',
      ne: 'एकाइ १: सफ्टवेयर, प्रक्रिया र जीवनचक्र मोडेल, एजाइल। एकाइ २: आवश्यकता इन्जिनियरिङ।',
    },
  },
  chapters: [
    {
      key: 'se-ch1',
      numberLabel: '1',
      title: { en: 'Software and Software Engineering', ne: 'सफ्टवेयर र सफ्टवेयर इन्जिनियरिङ' },
      description:
        'What software is, its domains and characteristics, common myths, and what software engineering means.',
      topics: [
        {
          key: 'se-ch1-t1',
          title: {
            en: 'What software is, and why projects fail',
            ne: 'सफ्टवेयर के हो, र परियोजना किन असफल हुन्छन्',
          },
          estimatedMinutes: 20,
          note: `
## Famous software failures
Software failures can cost lives and billions. Two classics:

- **Ariane 5 (1996):** the rocket destroyed itself about 40 seconds after launch. A 64-bit number was converted to a 16-bit integer that could not hold it — an **integer overflow** in code reused from Ariane 4.
- **Y2K (1999–2000):** to save storage, old systems kept years as two digits, so "00" could be read as 1900 instead of 2000. Organisations spent hundreds of billions of dollars checking and fixing software.

The lesson: building software needs **engineering discipline**, not just programming.

## What is software?
Software is more than a program. It is:

1. **Computer programs** — instructions that, when run, provide the desired features, function and performance;
2. **Data structures** the programs use; and
3. **Documentation** — requirement and design documents, source listings, test data and results, user manuals, installation and administration guides.

A **software product** is what is delivered to the customer (code, specifications, manuals). A **software process** is the way the product is produced.

## Software application domains
| Domain | Description | Examples |
|---|---|---|
| System software | Serves other programs; close to the hardware | Compilers, operating systems, drivers |
| Application (business) software | Stand-alone programs for a business need | CRM and accounting systems |
| Engineering / scientific | "Number crunching" algorithms | CAD, MATLAB, simulations |
| Embedded software | Inside products, often in read-only memory | Microwave keypad control, car ABS |
| Product-line software | One capability sold to many customers | Word processors, spreadsheets |
| Web / mobile applications | Linked pages to full computing environments | Online shops, banking apps |
| Artificial-intelligence software | Non-numerical algorithms for complex problems | Robotics, expert systems, pattern recognition |
`,
          questions: [
            mcq(
              'The Ariane 5 failure was caused by…',
              [
                'a Y2K date bug',
                'an integer overflow when converting a number to a smaller type',
                'a hardware fault in the engine',
                'a virus',
              ],
              1,
              'A 64-bit value was converted into a 16-bit integer that could not hold it.',
            ),
            multi(
              'Which of these are part of **software** (not just the program)?',
              ['Source code', 'User manuals', 'Test data and results', 'The CPU'],
              [0, 1, 2],
              'Software includes programs, data and documentation. The CPU is hardware.',
              'easy',
            ),
            match(
              'Match each application domain with an example.',
              [
                ['System software', 'Compiler'],
                ['Embedded software', 'Microwave keypad control'],
                ['Engineering / scientific software', 'CAD'],
                ['AI software', 'Expert system'],
              ],
              'Each domain has typical example products.',
            ),
            tf(
              'The Y2K problem arose because old systems stored the year as only two digits.',
              true,
              '"00" could be read as 1900 rather than 2000.',
              'easy',
            ),
          ],
        },
        {
          key: 'se-ch1-t2',
          title: { en: 'Characteristics, myths and good software', ne: 'विशेषता, भ्रम र राम्रो सफ्टवेयर' },
          estimatedMinutes: 20,
          note: `
## How software differs from hardware
| Hardware | Software |
|---|---|
| Manufactured | Developed (engineered) |
| Wears out over time | Does not wear out, but **deteriorates** as it is changed |
| Built from standard components | Still largely custom-built (moving towards reuse) |
| Costs are in production | Costs are in **design and development** |
| Hard to change once made | Routinely modified and upgraded |

### The failure curves
- Hardware follows a **bathtub curve**: many failures early (manufacturing defects), few in mid-life, then more as parts wear out.
- In theory software follows an idealised curve that flattens out once early bugs are fixed. In practice every **change introduces new defects**, so the failure rate spikes after each change and the minimum slowly rises — software **deteriorates**. There are no software spare parts; every failure is a design error.

## Software myths
Beliefs that sound reasonable but are wrong:

- "Software is easy to change." — every change risks new errors.
- "Testing can remove all errors." — testing shows the presence of bugs, not their absence.
- "Adding more people to a late project will speed it up." — new people need training and coordination; it often makes the project **later** (Brooks's law).
- "Once the program works, the job is done." — most effort comes **after** delivery, in maintenance.
- "More features means better software."

## Attributes of good software
| Attribute | Meaning |
|---|---|
| Maintainability | Can evolve to meet changing needs |
| Dependability | Reliable, secure and safe — can be trusted |
| Efficiency | Does not waste processor time, memory or other resources |
| Usability | Easy to use by the people it was built for |
`,
          questions: [
            tf(
              'Like hardware, software wears out with use.',
              false,
              'Software does not wear out; it deteriorates because changes introduce new defects.',
              'easy',
            ),
            mcq(
              'Which statement is a **software myth**?',
              [
                'Most effort is spent after delivery, in maintenance',
                'Adding more programmers to a late project will always finish it sooner',
                'Every change can introduce new defects',
                'Software costs are concentrated in design',
              ],
              1,
              "Adding people to a late project usually delays it further (Brooks's law).",
            ),
            multi(
              'Which are attributes of good software?',
              ['Maintainability', 'Dependability', 'Efficiency', 'Usability', 'Maximum number of features'],
              [0, 1, 2, 3],
              'More features does not mean better software.',
            ),
            blank(
              'Hardware failures over time follow the so-called [[b1]] curve.',
              { b1: ['bathtub'] },
              'High early failures, a long low period, then wear-out.',
            ),
          ],
        },
        {
          key: 'se-ch1-t3',
          title: {
            en: 'Software engineering: a layered technology',
            ne: 'सफ्टवेयर इन्जिनियरिङ: तहगत प्रविधि',
          },
          estimatedMinutes: 15,
          note: `
## Definitions
- **Fritz Bauer:** software engineering is the establishment and use of sound engineering principles in order to obtain, economically, software that is reliable and works efficiently on real machines.
- **IEEE:** software engineering is the application of a **systematic, disciplined, quantifiable** approach to the development, operation and maintenance of software.

## Software engineering vs computer science vs systems engineering
| | Concerned with |
|---|---|
| Computer science | Theory and fundamentals — algorithms, data structures, complexity |
| Software engineering | The practicalities of developing and delivering useful software |
| Systems engineering | All aspects of computer-based systems — hardware, software and process; software engineering is part of it |

## Why we need software engineering
It improves **quality**, raises **productivity**, helps **plan and control schedules**, **reduces cost**, and helps meet the **customer's requirements**.

## A layered technology
Software engineering is often drawn as four layers, each resting on the one below:

1. **A quality focus** — the bedrock: a culture of continuous improvement (e.g. TQM, Six Sigma).
2. **Process** — the foundation: a framework of activities that says who does what, when and how.
3. **Methods** — the technical "how-to": requirements analysis, design, construction, testing, support.
4. **Tools** — automated support for process and methods; integrated tools form **CASE** (computer-aided software engineering).
`,
          questions: [
            mcq(
              'Which layer is the **bedrock** of software engineering as a layered technology?',
              ['Tools', 'Methods', 'Process', 'A quality focus'],
              3,
              'Quality focus → process → methods → tools, from the bottom up.',
            ),
            mcq(
              'IEEE describes software engineering as an approach that is…',
              [
                'quick, cheap and informal',
                'systematic, disciplined and quantifiable',
                'artistic and creative only',
                'hardware-centred',
              ],
              1,
              'The IEEE definition stresses a systematic, disciplined, quantifiable approach.',
              'easy',
            ),
            blank(
              "When software tools are integrated so one tool's output feeds another, the result is called [[b1]].",
              { b1: ['CASE', 'computer-aided software engineering', 'computer aided software engineering'] },
              'CASE = computer-aided software engineering.',
            ),
          ],
        },
      ],
      revision: `
- Software = **programs + data + documentation**; product = what is delivered, process = how it is made.
- Domains: system, application, engineering/scientific, embedded, product-line, web/mobile, AI.
- Software is **developed, not manufactured**; it **deteriorates** rather than wears out.
- Myths: easy to change; testing removes all bugs; adding people speeds a late project.
- Good software: **maintainable, dependable, efficient, usable**.
- Layers: **quality focus → process → methods → tools (CASE)**.
`,
    },
    {
      key: 'se-ch2',
      numberLabel: '2',
      title: { en: 'The Software Process', ne: 'सफ्टवेयर प्रक्रिया' },
      description:
        'The generic process framework, umbrella activities, and why every project needs a life-cycle model.',
      topics: [
        {
          key: 'se-ch2-t1',
          title: { en: 'Framework and umbrella activities', ne: 'फ्रेमवर्क र अम्ब्रेला गतिविधि' },
          estimatedMinutes: 20,
          note: `
## What is a software process?
A **software process** is a framework for the activities, actions and tasks needed to build high-quality software. It defines **who** does **what**, **when** and **how** to reach a goal.

- Each **framework activity** is made up of **software engineering actions** (e.g. architectural design).
- Each action is made up of **work tasks**, work products, quality checkpoints and milestones.

## The five generic framework activities
| Activity | What happens |
|---|---|
| **Communication** | Talk with customers and stakeholders; gather requirements |
| **Planning** | Plan the work: tasks, risks, resources, work products, schedule (the project plan) |
| **Modeling** | Build models to understand requirements (analysis) and the design |
| **Construction** | Generate code (by hand or automatically) and **test** it |
| **Deployment** | Deliver to the customer, who evaluates it and gives feedback |

## Umbrella activities
These run **throughout** the project, across all framework activities:

1. **Software project tracking and control** — compare progress with the plan and act to keep to the schedule.
2. **Risk management** — assess risks that may affect the outcome or quality.
3. **Software quality assurance** — define and conduct activities that ensure quality.
4. **Technical reviews** — inspect work products to find errors before they move on.
5. **Measurement** — collect process, project and product measures.
6. **Software configuration management** — manage the effects of change.
7. **Reusability management** — criteria and mechanisms for reusing work products.
8. **Work-product preparation and production** — models, documents, logs, forms, lists.

> **Memory hook for the framework:** "**C**an **P**eople **M**ake **C**ool **D**esigns" — Communication, Planning, Modeling, Construction, Deployment.
`,
          questions: [
            mcq(
              'Which is **not** one of the five generic framework activities?',
              ['Communication', 'Planning', 'Marketing', 'Deployment'],
              2,
              'The five are communication, planning, modeling, construction and deployment.',
              'easy',
            ),
            num(
              'How many generic framework activities are there in a software process?',
              5,
              'Communication, planning, modeling, construction, deployment.',
              'easy',
            ),
            multi(
              'Which of these are **umbrella activities**?',
              [
                'Risk management',
                'Software configuration management',
                'Software quality assurance',
                'Construction',
              ],
              [0, 1, 2],
              'Construction is a framework activity; the others run across the whole process.',
            ),
            match(
              'Match each framework activity with what happens in it.',
              [
                ['Communication', 'Requirements are gathered from stakeholders'],
                ['Planning', 'Tasks, risks, resources and schedule are worked out'],
                ['Construction', 'Code is generated and tested'],
                ['Deployment', 'The customer evaluates the delivered increment'],
              ],
              'Each activity has a distinct purpose.',
            ),
          ],
        },
        {
          key: 'se-ch2-t2',
          title: { en: 'Life-cycle models and phase criteria', ne: 'जीवनचक्र मोडेल र चरणका मापदण्ड' },
          estimatedMinutes: 15,
          note: `
## The software life cycle
Every product passes through stages during its life: **conceptualise → specify → design → code → test → deliver → maintain → retire**.

A **software life-cycle model** (process model, or **SDLC**) is a descriptive and diagrammatic model of these stages. It:

- identifies **all activities** undertaken during development;
- puts them in a **precedence order**; and
- divides the life cycle into **phases**.

## Why use a model?
- It gives the team a **common understanding** of what to do and when.
- It exposes inconsistencies, redundancies and omissions in the process.
- It can be tailored to a specific project.

Without one, a team works in chaos — one person codes, another writes tests first, another designs file formats — and the project fails.

### Build-and-fix (exploratory) style
A single programmer can often code, test and fix in any order. This **does not scale** to teams.

## Entry and exit criteria, and milestones
- Each phase has **entry criteria** (it may start only when they are met) and **exit criteria** (it is complete only when they are met).
- Example exit criterion for requirements: *the SRS is complete, reviewed and approved by the customer.*
- Phase entries and exits are **milestones**, which let a manager track progress accurately.
- Without a model, managers rely on guesses and suffer the **"99% complete" syndrome** — work that stays almost finished for weeks.

> **Myth vs reality:** the only deliverable is not the working program — the documentation of every stage is needed for operation and maintenance.
`,
          questions: [
            mcq(
              'What is the "99% complete syndrome"?',
              [
                'A program with 1% of bugs remaining',
                'Without clear phases and milestones, a project reports being almost done for a long time',
                'Testing that covers 99% of the code',
                'A requirements document missing 1% of requirements',
              ],
              1,
              'Without a life-cycle model, progress is guessed rather than measured.',
            ),
            tf(
              'A phase in a life-cycle model is complete only when all its exit criteria are satisfied.',
              true,
              'Exit criteria define when a phase is done.',
              'easy',
            ),
            subj(
              'Why should a software team follow a life-cycle model? What can go wrong without one?',
              `A model gives a **shared understanding** of activities and their order, defines **entry/exit criteria** and **milestones** so progress can be tracked, and helps spot missing or repeated work.

Without one, team members work in conflicting orders, the manager must rely on guesses (the **99% complete syndrome**), and large projects tend to fail.`,
            ),
          ],
        },
      ],
      revision: `
- A process = framework activities → actions → tasks.
- Framework: **communication, planning, modeling, construction, deployment**.
- Umbrella: tracking and control, risk, SQA, reviews, measurement, configuration management, reuse, documents.
- A **life-cycle model (SDLC)** lists activities, orders them and divides them into phases.
- Phases have **entry and exit criteria**; their boundaries are **milestones**.
`,
    },
    {
      key: 'se-ch3',
      numberLabel: '3',
      title: { en: 'Life-Cycle Models', ne: 'जीवनचक्र मोडेलहरू' },
      description:
        'Waterfall, V, prototyping, incremental, evolutionary, RAD, unified process and spiral models.',
      topics: [
        {
          key: 'se-ch3-t1',
          title: { en: 'Waterfall and V models', ne: 'वाटरफल र V मोडेल' },
          estimatedMinutes: 25,
          note: `
## Classical waterfall model
The simplest and most intuitive model. Phases follow one another like a waterfall:

1. **Feasibility study** — is the project financially worthwhile and technically possible? (economic, technical and schedule feasibility; cost–benefit analysis; a business case)
2. **Requirements analysis and specification** — gather and analyse requirements; document them in the **SRS**.
3. **Design** — turn the SRS into a form that can be coded (traditional: structured analysis and structured design; or object-oriented design).
4. **Coding and unit testing** — code each module and test it on its own.
5. **Integration and system testing** — integrate modules step by step, then test the whole system against the SRS.
6. **Maintenance** — corrective, perfective and adaptive.

### Effort
Among all phases, **maintenance** takes the most effort (development to maintenance is typically about **40 : 60**). Among the development phases, **testing** takes the most.

### Types of maintenance
| Type | Purpose |
|---|---|
| Corrective | Fix errors not found during development |
| Perfective | Improve the implementation or add functions |
| Adaptive | Port the software to a new environment (hardware, OS) |

## Iterative waterfall model
The classical model assumes no defects are introduced — unrealistic. The **iterative waterfall** adds **feedback paths** so a phase can be reworked when a defect is found later. Principle: **phase containment of errors** — find errors in the phase where they were made, because fixing them later costs much more. It is the most widely used model, and most others derive from it.

| Strengths | Weaknesses |
|---|---|
| Easy to understand and manage | All requirements must be known up front |
| Clear milestones | Integration happens only at the end |
| Requirements stable during development | Customer sees the system late |

**Use it when** requirements are well known and stable, the technology is understood and the team is experienced.

## V model
A variant of waterfall that stresses **verification and validation**: for every development phase, a matching **test phase is planned in parallel**.

| Development (left side) | Test planned for it (right side) |
|---|---|
| Requirements specification | System testing |
| High-level design | Integration testing |
| Detailed design | Unit testing |
| Coding (the base of the V) | |

**Strengths:** testing planned early, every deliverable is testable. **Weaknesses:** no overlapping phases, poor at handling change and risk. **Use it for** high-reliability systems such as embedded and safety-critical software.
`,
          questions: [
            mcq(
              'Which phase of the life cycle consumes the **maximum effort** overall?',
              ['Requirements', 'Design', 'Coding', 'Maintenance'],
              3,
              'Maintenance typically takes around 60% of total effort.',
            ),
            mcq(
              'Porting software to a new operating system is which type of maintenance?',
              ['Corrective', 'Perfective', 'Adaptive', 'Preventive'],
              2,
              'Adaptive maintenance adapts software to a new environment.',
            ),
            match(
              'In the V model, match each development phase with the test planned alongside it.',
              [
                ['Requirements specification', 'System testing'],
                ['High-level design', 'Integration testing'],
                ['Detailed design', 'Unit testing'],
              ],
              'Each level of the left side is verified by the matching level on the right.',
            ),
            blank(
              'Detecting errors in the same phase in which they are introduced is called phase [[b1]] of errors.',
              { b1: ['containment'] },
              'Phase containment keeps the cost of fixing errors low.',
            ),
            tf(
              'The classical waterfall model is suitable when requirements change often during development.',
              false,
              'Waterfall needs stable requirements known up front.',
              'easy',
            ),
          ],
        },
        {
          key: 'se-ch3-t2',
          title: {
            en: 'Prototyping, incremental, evolutionary and RAD',
            ne: 'प्रोटोटाइपिङ, इन्क्रिमेन्टल, इभोलुसनरी र RAD',
          },
          estimatedMinutes: 25,
          note: `
## Prototyping model
Before building the real system, build a **prototype** — a toy version with limited function, low reliability and poor performance, built quickly with short-cuts (dummy functions, table look-ups).

**Cycle:** gather requirements → quick design → build prototype → customer evaluates → refine requirements → … until the customer is satisfied. Then the real system is built (usually waterfall) and the prototype is **thrown away** — but the experience is kept.

- **Why:** requirements are unclear, or technical questions (response time, algorithm efficiency) must be answered first; "plan to throw one away".
- **Advantages:** more usable software, better user involvement, fewer late changes, often lower overall cost.
- **Disadvantages:** extra cost for some projects; risk of over-engineering.

## Incremental model
Split requirements into **features (slices)** and deliver the system in **increments**:

- the **first increment** is the core product;
- each later increment adds or fixes functions;
- the **final increment** is the complete product.

Each increment is a mini-project (often a mini-waterfall). Features can be ordered by a **value-to-cost ratio** (V/C) — high-value, low-cost first.

## Evolutionary model (with iterations)
Develop the **core modules first**, then refine the skeleton into more capable versions through many short iterations (often 2–6 weeks each). Each iteration ends with tested, integrated, working software. Requirements are **not frozen** — about 40% of final requirements arrive after development starts.

| Advantages | Problems |
|---|---|
| Users try a partial system early | Process is less visible — fewer regular deliverables |
| Finds exact requirements; core is well tested | Hard to schedule and staff |
| Handles change and complexity better | Structure can degrade with constant change |

## RAD (rapid application development)
Aims to **cut time and cost** and accept changes early. Plans are made for one **time box** (increment) at a time; in each, a quick prototype of some features is built, evaluated by the customer and refined. Heavy **reuse** and specialised visual tools make it fast.

- **Suits:** custom products for one or two customers, where performance and reliability are not critical and the system splits into independent modules.
- **Does not suit:** high-performance or high-reliability systems, systems that cannot be modularised, or where few reusable components exist.

| | Prototyping | RAD | Evolutionary |
|---|---|---|---|
| Prototype | Thrown away | **Evolves into** the product | — |
| Increments | — | Quick-and-dirty prototypes | Systematically built mini-waterfalls |
`,
          questions: [
            mcq(
              'In the **prototyping** model, what usually happens to the prototype once the customer approves it?',
              [
                'It becomes the final product',
                'It is thrown away; the real system is then built',
                'It is sold separately',
                'It replaces the SRS forever',
              ],
              1,
              'The prototype is usually discarded, though the experience gained is kept.',
            ),
            mcq(
              'In which model does the prototype **evolve into** the delivered software?',
              ['Prototyping model', 'RAD', 'Classical waterfall', 'V model'],
              1,
              'In RAD the prototype is refined into the deliverable software.',
            ),
            tf(
              'In the incremental model, the first increment is usually the core product.',
              true,
              'Later increments add functionality until the product is complete.',
              'easy',
            ),
            multi(
              'For which situations is **RAD unsuitable**?',
              [
                'High performance or reliability is required',
                'The system cannot be modularised',
                'A custom product for one customer with independent modules',
                'Few reusable components are available',
              ],
              [0, 1, 3],
              'RAD suits modular, non-critical, custom systems with plenty of reuse.',
            ),
            num(
              'Features are ordered by value/cost. A feature has value 9 and cost 2. What is its V/C ratio?',
              4.5,
              'V/C = 9 ÷ 2 = 4.5.',
              'easy',
            ),
          ],
        },
        {
          key: 'se-ch3-t3',
          title: { en: 'Unified process and spiral model', ne: 'युनिफाइड प्रोसेस र स्पाइरल मोडेल' },
          estimatedMinutes: 20,
          note: `
## Unified Process (UP / RUP)
Developed by **Ivar Jacobson, Grady Booch and James Rumbaugh**; incremental and iterative. The **Rational Unified Process (RUP)** is Rational Software's version (Rational was acquired by IBM in 2003).

It has **four phases**, each with several iterations:

| Phase | Main work | Typical work products |
|---|---|---|
| **Inception** | Scope, business case, risks, candidate architecture | Initial business case, risk list, project plan, prototype, initial use-case model (10–20%) |
| **Elaboration** | Requirements analysis and architecture | Use-case model, analysis model, architecture, revised risk list |
| **Construction** | Build and test the software | Design model, components, test plans and cases, manuals |
| **Transition** | Deliver to users; beta testing | Software increment, beta-test reports, user feedback |

RUP has two dimensions: the **horizontal** axis is time (phases and iterations); the **vertical** axis is the core workflows (requirements, design, implementation, test…).

## Spiral model (Boehm, 1988)
Each **loop** of the spiral is a phase (feasibility, then requirements, then design…). There are no fixed phases. Each loop has **four quadrants**:

1. **Determine objectives** and identify alternative solutions.
2. **Identify and resolve risks** — analyse each risk and reduce it, e.g. by building a prototype.
3. **Develop and validate** the next level of the product.
4. **Review and plan** the next iteration with the customer.

- A **risk** is any adverse circumstance that might hamper the project.
- The spiral is a **meta-model**: a single loop is the waterfall; it uses evolutionary iterations and prototyping for risk reduction.
- **Best for** large, high-risk projects.

### Win–win spiral model
Adds explicit **negotiation**: the customer "wins" a system meeting most of their needs; the developer "wins" realistic requirements, an achievable budget and a deadline.
`,
          questions: [
            mcq(
              'What is the main focus of the **second quadrant** of each spiral loop?',
              [
                'Writing code',
                'Identifying and resolving risks',
                'Deploying to the customer',
                'Writing the user manual',
              ],
              1,
              'Risk assessment and reduction is the heart of the spiral model.',
            ),
            match(
              'Match each Unified Process phase with its focus.',
              [
                ['Inception', 'Scope, business case and initial risks'],
                ['Elaboration', 'Requirements analysis and architecture'],
                ['Construction', 'Building and testing the software'],
                ['Transition', 'Delivery and beta testing'],
              ],
              'The four RUP phases in order.',
            ),
            tf(
              'The spiral model can be seen as a meta-model, because a single loop of it represents the waterfall model.',
              true,
              'It subsumes waterfall, evolutionary and prototyping ideas.',
            ),
            blank(
              'The spiral model was proposed by Barry [[b1]] in 1988.',
              { b1: ['Boehm'] },
              'Barry Boehm proposed the spiral model.',
              'easy',
            ),
          ],
        },
      ],
      revision: `
- **Waterfall:** feasibility → requirements (SRS) → design → coding & unit test → integration & system test → maintenance. Maintenance ≈ 60% of effort.
- **Iterative waterfall:** feedback paths; **phase containment of errors**.
- **V model:** each development phase has a parallel test phase; for safety-critical systems.
- **Prototyping:** throw-away prototype for unclear requirements. **RAD:** prototype evolves into the product.
- **Incremental / evolutionary:** core first, then increments; requirements not frozen.
- **Unified Process:** inception, elaboration, construction, transition.
- **Spiral:** loops with four quadrants; **risk-driven**; a meta-model.
`,
    },
    {
      key: 'se-ch4',
      numberLabel: '4',
      title: { en: 'Agile Development', ne: 'एजाइल विकास' },
      description:
        'The agile manifesto and principles, Extreme Programming, Scrum and adaptive software development.',
      topics: [
        {
          key: 'se-ch4-t1',
          title: { en: 'Agility, the manifesto and principles', ne: 'एजाइलिटी, म्यानिफेस्टो र सिद्धान्त' },
          estimatedMinutes: 20,
          note: `
## What is agility?
**Agility** is an effective — rapid and adaptive — response to change, with close communication among all stakeholders and the customer on the team. Agile development is **time-boxed and iterative**: it breaks the work into small pieces of user functionality (**user stories**), prioritises them, and delivers them continuously in short cycles (typically two weeks).

Why use it: more **customer involvement**, higher **quality**, simpler releases, lower **risk**.

## The Agile Manifesto (2001)
> We value **individuals and interactions** over processes and tools; **working software** over comprehensive documentation; **customer collaboration** over contract negotiation; **responding to change** over following a plan. — *While there is value in the items on the right, we value the items on the left more.*

## Selected agile principles (there are 12)
1. Satisfy the customer through **early and continuous delivery** of valuable software.
2. **Welcome changing requirements**, even late in development.
3. Deliver working software **frequently** — weeks rather than months.
4. Business people and developers **work together daily**.
5. Face-to-face conversation is the best way to share information.
6. **Working software is the primary measure of progress.**
7. Keep a **sustainable pace** indefinitely.
8. **Simplicity** — maximising the work not done — is essential.
9. The best designs emerge from **self-organising teams**.
10. The team **regularly reflects** and adjusts how it works.

## Agile vs traditional
| | Traditional (plan-driven) | Agile |
|---|---|---|
| Requirements | Fixed up front | Evolve; change is welcome |
| Delivery | One release at the end | Frequent small increments |
| Documentation | Comprehensive | Just enough |
| Customer | Involved at start and end | On the team throughout |
| Cost of change | Rises steeply late | Kept low |

**Agile methods** include Scrum, Extreme Programming (XP), Kanban, Adaptive Software Development (ASD), DSDM, Feature-Driven Development (FDD), Crystal, Lean, and the Agile Unified Process.
`,
          questions: [
            mcq(
              'According to the Agile Manifesto, which is valued **more**?',
              ['Comprehensive documentation', 'Following a plan', 'Working software', 'Contract negotiation'],
              2,
              'Working software over comprehensive documentation.',
              'easy',
            ),
            multi(
              'Which are values from the Agile Manifesto (the items valued more)?',
              [
                'Individuals and interactions',
                'Customer collaboration',
                'Responding to change',
                'Processes and tools',
              ],
              [0, 1, 2],
              'Processes and tools are on the right-hand side — valued less.',
            ),
            tf(
              'In agile development, working software is the primary measure of progress.',
              true,
              'It is one of the twelve agile principles.',
              'easy',
            ),
            num(
              'How many principles are listed behind the Agile Manifesto?',
              12,
              'There are twelve agile principles.',
              'easy',
            ),
          ],
        },
        {
          key: 'se-ch4-t2',
          title: { en: 'Extreme Programming (XP)', ne: 'एक्स्ट्रिम प्रोग्रामिङ (XP)' },
          estimatedMinutes: 20,
          note: `
## The idea
**Extreme Programming (XP)** was proposed by **Kent Beck** (1999). It takes good practices to the extreme: *if something is good, do it all the time.*

| If this is good… | …XP does it to the extreme |
|---|---|
| Code review | Review constantly — **pair programming** |
| Testing | Write tests first and run them continually — **test-driven development** |
| Incremental development | New increments every few days |
| Simplicity | The **simplest design** that supports today's functions |
| Design | Everybody improves the design daily — **refactoring** |
| Integration testing | Build and integrate many times a day — **continuous integration** |

## XP activities
- **Planning** — the customer writes **user stories**; the team estimates each; stories are grouped into releases; after the first increment, **project velocity** helps plan later ones.
- **Design** — keep it simple (KIS); use **CRC cards**; build a **spike solution** (design prototype) for hard problems; refactor constantly.
- **Coding** — write the **unit test before the code**; **pair programming**.
- **Testing** — all unit tests run **daily**; **acceptance tests** are written by the customer.

## Five core values
**Communication, simplicity, feedback, courage, respect.** "Do the simplest thing that could possibly work" and "You aren't going to need it" (YAGNI) express simplicity.

## Key practices
Planning game · small releases · metaphor (shared vocabulary for the system) · simple design · pair programming · test-driven development · refactoring · continuous integration · coding standard · collective code ownership · sustainable pace (40-hour week) · whole team with an on-site customer · customer tests.

**Suited to:** projects with new technology or research, where requirements change quickly, and small projects.
`,
          questions: [
            mcq(
              'Who proposed Extreme Programming?',
              ['Barry Boehm', 'Kent Beck', 'Ivar Jacobson', 'Jeff Sutherland'],
              1,
              'Kent Beck proposed XP in 1999.',
              'easy',
            ),
            mcq(
              'In XP, what is written **before** the code?',
              ['The user manual', 'The unit test', 'The deployment script', 'The SRS'],
              1,
              'Test-driven development: write the test, then the code that makes it pass.',
              'easy',
            ),
            multi(
              'Which of the following are XP core values?',
              ['Communication', 'Simplicity', 'Feedback', 'Courage', 'Bureaucracy'],
              [0, 1, 2, 3],
              'The five XP values are communication, simplicity, feedback, courage and respect.',
            ),
            blank(
              'In XP, a quick design prototype built to explore a difficult design problem is called a [[b1]] solution.',
              { b1: ['spike'] },
              'Spike solutions reduce risk before committing to a design.',
            ),
          ],
        },
        {
          key: 'se-ch4-t3',
          title: { en: 'Scrum', ne: 'स्क्रम' },
          estimatedMinutes: 20,
          note: `
## What Scrum is
**Scrum** (Jeff Sutherland; extended by Schwaber and Beedle) is an agile framework with **self-organising teams** that build the product in a series of **sprints**. Work comes from a prioritised **backlog**, testing and documentation happen as the product is built, and the sprint ends with a demo.

## The Scrum framework
| Roles | Ceremonies (events) | Artifacts |
|---|---|---|
| Product Owner | Sprint planning | Product backlog |
| Scrum Master | Daily Scrum | Sprint backlog |
| Development Team | Sprint review | Burndown charts |
| | Sprint retrospective | |

### Roles
- **Product Owner** — represents the customer: defines features, decides release dates and content, **prioritises** the backlog by value, accepts or rejects results.
- **Scrum Master** — facilitates the process, removes **impediments**, shields the team from interference.
- **Team** — about **five to nine** people (seven, plus or minus two) with cross-functional skills; organises its own work.

### The sprint
- A **time box** (often two to four weeks; classically a month) in which an increment is designed, coded and tested.
- **No changes are accepted during a sprint.**

### Ceremonies
- **Sprint planning** — the team and Product Owner choose backlog items to make the **sprint backlog**.
- **Daily Scrum** — a 15-minute stand-up; each member answers: *What did I do yesterday? What will I do today? What is in my way?* It is **not** a problem-solving meeting.
- **Sprint review** — the team demos what it built to the stakeholders.
- **Sprint retrospective** — the team reflects on how to improve.

### Artifacts
- **Product backlog** — every desired item of work, owned and prioritised by the Product Owner.
- **Sprint backlog** — the items (and tasks) for this sprint; updated daily by the team.
- **Burndown chart** — remaining work against time; sprint, release and product burndowns.

## XP vs Scrum
| | XP | Scrum |
|---|---|---|
| Iteration length | 1–2 weeks | 2–4 weeks |
| Changes during an iteration | A story not yet started may be swapped for one of equal size | Not allowed |
| Engineering practices | Prescribed strictly (TDD, pairing) | Not prescribed |

## Adaptive Software Development (ASD)
Jim Highsmith's agile method: mission-driven planning, component focus, time-boxing, explicit risk handling, collaboration and continuous **learning** (cycle: speculate → collaborate → learn).
`,
          questions: [
            mcq(
              'Who prioritises the **product backlog** in Scrum?',
              ['Scrum Master', 'Product Owner', 'The newest developer', "The customer's lawyer"],
              1,
              'The Product Owner owns and prioritises the product backlog.',
              'easy',
            ),
            num(
              'How long, in minutes, is the Daily Scrum meeting?',
              15,
              'The Daily Scrum is a 15-minute stand-up.',
              'easy',
            ),
            multi(
              'Which three questions does each member answer in the Daily Scrum?',
              [
                'What did I do yesterday?',
                'What will I do today?',
                'What obstacles are in my way?',
                'How much should we charge the customer?',
              ],
              [0, 1, 2],
              'The daily stand-up covers progress, plans and impediments.',
            ),
            tf(
              'In Scrum, new requirements may be added to the current sprint at any time.',
              false,
              'No changes are entertained during a sprint.',
            ),
            match(
              'Match each Scrum artifact with its description.',
              [
                ['Product backlog', 'Prioritised list of all desired work'],
                ['Sprint backlog', 'Items and tasks chosen for the current sprint'],
                ['Burndown chart', 'Remaining work plotted against time'],
              ],
              'The three Scrum artifacts.',
            ),
          ],
        },
      ],
      revision: `
- **Agility:** rapid, adaptive response to change; frequent increments; customer on the team.
- **Manifesto:** individuals & interactions, working software, customer collaboration, responding to change.
- **XP (Kent Beck):** pair programming, TDD, refactoring, continuous integration, small releases, simple design; values = communication, simplicity, feedback, courage, respect.
- **Scrum:** Product Owner, Scrum Master, Team (7 ± 2); sprint planning, daily scrum (15 min), sprint review, retrospective; product backlog, sprint backlog, burndown chart; no changes during a sprint.
- **ASD:** speculate, collaborate, learn.
`,
    },
    {
      key: 'se-ch5',
      numberLabel: '5',
      title: { en: 'Requirements Engineering', ne: 'आवश्यकता इन्जिनियरिङ' },
      description:
        'Kinds of requirements, the SRS and IEEE 830, gathering and analysis, and decision trees and tables.',
      topics: [
        {
          key: 'se-ch5-t1',
          title: {
            en: 'Functional, non-functional and domain requirements',
            ne: 'फङ्सनल, नन-फङ्सनल र डोमेन आवश्यकता',
          },
          estimatedMinutes: 25,
          note: `
## Requirements engineering
**Requirements engineering (RE)** is the process of finding out, analysing, documenting and checking the services a system should provide and the constraints on it. A **requirement** is a statement of a service the system should provide or a constraint on it.

- **User requirements** — high-level, natural-language statements (plus diagrams) for customers.
- **System requirements** — a detailed, structured description of functions, services and constraints; may form part of the contract.

## Three kinds of requirements
| Kind | What it says | Example (hospital patient system) |
|---|---|---|
| **Functional** | What the system should **do** — services and reactions to inputs | "A user shall be able to search the appointment lists for all clinics." |
| **Non-functional** | **Constraints** on the system or its development — speed, reliability, security, standards | "The system shall be available during clinic hours with less than five seconds' downtime a day." |
| **Domain** | Come from the **application domain** | A train-control system must use the braking formula for the track gradient. |

### Non-functional requirements in more detail
They often apply to the **whole system** and can matter more than functional ones — if they are not met, the system may be useless.

| Type | Origin | Example |
|---|---|---|
| Product | How the product must behave | Response time, reliability, memory use |
| Organisational | Policies and procedures of the organisations | Must use a given language or development method; staff log in with ID cards |
| External | Factors outside the system | Legal and regulatory rules, privacy, ethics |

### Goals vs verifiable requirements
- A **goal** is a general intention: *"The system should be easy to use."* — cannot be tested.
- A **verifiable requirement** uses a measure: *"After four hours of training, users shall make no more than two errors per hour."*

| Property | Measures |
|---|---|
| Speed | Transactions per second; response time; screen refresh time |
| Size | Megabytes; number of ROM chips |
| Ease of use | Training time; number of help screens |
| Reliability | Mean time to failure; rate of failure; availability |
| Robustness | Time to restart after failure; probability of data corruption |
| Portability | Number of target systems; % of target-dependent statements |

## Qualities of good requirements
Complete, consistent, feasible, modifiable, **unambiguous** and **testable**. Ambiguity is a common problem: "search" may mean *all clinics* to the user but *one clinic* to the developer.
`,
          questions: [
            mcq(
              '"The system shall respond to any query within 2 seconds" is an example of a…',
              [
                'functional requirement',
                'non-functional (product) requirement',
                'domain requirement',
                'design decision',
              ],
              1,
              'It constrains performance, so it is a non-functional product requirement.',
            ),
            mcq(
              'Which of these is **verifiable**?',
              [
                'The system should be user friendly',
                'Users shall complete registration in under 3 minutes after 1 hour of training',
                'The interface should look modern',
                'The system should be fast',
              ],
              1,
              'A measurable statement can be tested objectively.',
            ),
            match(
              'Match each non-functional requirement type with an example.',
              [
                ['Product', 'Response time under one second'],
                ['Organisational', 'The system must be written in Java'],
                ['External', 'Must comply with the data-privacy law'],
              ],
              'Product, organisational and external requirements come from different sources.',
            ),
            tf(
              'Non-functional requirements can be more critical than functional requirements.',
              true,
              'If, for example, reliability or performance requirements are not met, the system may be unusable.',
            ),
            multi(
              'Which are desirable characteristics of requirements?',
              ['Unambiguous', 'Testable', 'Consistent', 'Vague'],
              [0, 1, 2],
              'Good requirements are complete, consistent, feasible, modifiable, unambiguous and testable.',
              'easy',
            ),
          ],
        },
        {
          key: 'se-ch5-t2',
          title: { en: 'The SRS document and IEEE 830', ne: 'SRS कागजात र IEEE 830' },
          estimatedMinutes: 25,
          note: `
## The software requirements specification (SRS)
The SRS is the **official statement of what the system must do**. It includes user requirements and the detailed system requirements. It says **what**, not **how** — it is **not a design document**. It is a **black-box specification**: only the system's inputs, outputs and visible behaviour are described.

### Uses of the SRS
- Basis of **agreement** (contract) between customer and supplier
- Starting point for **design and development**
- Basis for **cost and schedule estimates**
- Basis for **verification and validation** (testing)
- Basis for the **user manual** and later **enhancements**

A good SRS **reduces cost**: requirement errors grow exponentially more expensive to fix the later they are found, and around 40% of requirements change later.

### Readers
Customers and users, analysts, developers, testers and project managers — each needs different levels of detail.

## Four important parts
1. **Functional requirements** — the heart of the SRS; for each function the inputs, outputs and processing, including behaviour for **invalid** inputs.
2. **External interfaces** — user, hardware, software and communication interfaces; file formats.
3. **Non-functional requirements** — maintainability, portability, usability, security, safety, reliability, performance (measurable).
4. **Constraints** — hardware, OS or DBMS to use, I/O capabilities, standards.

*Goals of implementation* (e.g. reusability, future functions) may be listed but are not checked for compliance.

## Properties of a good SRS
Concise yet unambiguous · says **what**, not how · easy to change (well structured) · consistent · complete · **traceable** (to design, code and tests) · **verifiable** ("user friendly" is not verifiable).

**An SRS should not contain:** project plans (cost, staff, schedules), product-assurance plans, or designs.

### Bad SRS documents show…
Unstructured narrative · **noise** (irrelevant text) · **silence** (important points missing) · **over-specification** (saying how, e.g. "store names sorted in descending order") · contradictions · ambiguity · forward references · wishful thinking.

## IEEE 830-1998 outline
1. **Introduction** — purpose, scope, definitions, references, overview
2. **Overall description** — product perspective, product functions, user characteristics, constraints, assumptions and dependencies
3. **Specific requirements** — external interfaces, functions, performance, logical database, design constraints, quality attributes, object-oriented models
4. Appendices · 5. Index

## Ways of writing requirements
Natural language (numbered sentences; use **shall** for mandatory, **should** for desirable) · structured natural language (form- or table-based) · design description languages · graphical notations (UML use cases, sequence diagrams) · mathematical specifications (state machines, sets).
`,
          questions: [
            mcq(
              'The SRS is called a **black-box** specification because it…',
              [
                'is printed in black',
                "describes only the system's external behaviour, not its internal design",
                'is kept secret from the customer',
                'describes hardware only',
              ],
              1,
              'It documents inputs, outputs and behaviour — what, not how.',
            ),
            multi(
              'Which of these should **not** be in an SRS?',
              [
                'Project cost and staffing plans',
                'Detailed design',
                'Functional requirements',
                'Non-functional requirements',
              ],
              [0, 1],
              'Plans and designs have different audiences and lifetimes; requirements belong in the SRS.',
            ),
            mcq(
              'Writing "Library member names should be stored in sorted descending order" in an SRS is an example of…',
              ['noise', 'silence', 'over-specification', 'forward reference'],
              2,
              'It says how to implement something, restricting the designer.',
            ),
            match(
              'Match each IEEE 830 section with its content.',
              [
                ['1. Introduction', 'Purpose, scope, definitions and references'],
                ['2. Overall description', 'Product perspective, user characteristics, assumptions'],
                ['3. Specific requirements', 'External interfaces, functions, performance requirements'],
              ],
              'The three main sections of the IEEE 830 SRS template.',
            ),
            blank(
              'In requirement statements, the word [[b1]] marks a mandatory requirement, while "should" marks a desirable one.',
              { b1: ['shall'] },
              '"Shall" for mandatory, "should" for desirable.',
            ),
          ],
        },
        {
          key: 'se-ch5-t3',
          title: {
            en: 'Gathering, analysis, decision trees and tables',
            ne: 'सङ्कलन, विश्लेषण, निर्णय रूख र तालिका',
          },
          estimatedMinutes: 25,
          note: `
## The requirements process
**Feasibility study → requirements gathering → requirements analysis → requirements specification → review**, producing the **SRS**. Review may send work back to gathering and analysis.

## Requirements gathering (elicitation)
Fully understand what users need. Techniques:

1. **Study existing documentation** and procedures
2. **Interviews** with users and customers
3. **Task analysis** — the steps of each task the software must support
4. **Scenario analysis** — the different situations that can arise in each task
5. **Form analysis** — the forms currently used, showing inputs and outputs

A good analyst has strong communication skills, imagination and experience. For a generic product, requirements often come from **sales and marketing** staff.

> **Case study:** to automate a university department office, student analysts interviewed the clerks and the head of department, analysed each task and its scenarios, collected the forms in use, resolved conflicts in discussions, and wrote the SRS.

## Requirements analysis
Gathered requirements usually contain problems, because each user sees only part of the system:

| Problem | Meaning | Example |
|---|---|---|
| **Inconsistency** | One requirement contradicts another | One user: above 100 °C turn off the heater and open the shower. Another: turn off the heater and turn on the cooler. |
| **Incompleteness** | Something needed is missing | Nobody said what happens when the temperature falls below 90 °C. |
| **Ambiguity** | Can be read more than one way | "Search" — one clinic or all clinics? |

These are resolved through further discussion with users and customers.

## Representing complex logic
### Decision trees
A graphical view of decision logic: **edges are conditions**, **leaves are actions**. Example — library membership software:

- New member → get details, create record, print bill
- Renewal → get details, update expiry date, print bill
- Cancel → get details, print cheque, delete record
- Invalid option → print an error message

### Decision tables
A table of **conditions** (upper rows) and **actions** (lower rows). Each **column is a rule**: if its conditions hold, its marked actions run.

| Conditions | R1 | R2 | R3 | R4 |
|---|---|---|---|---|
| Valid selection | No | Yes | Yes | Yes |
| New member | – | Yes | No | No |
| Renewal | – | No | Yes | No |
| Cancellation | – | No | No | Yes |
| **Actions** | | | | |
| Display error message | X | | | |
| Ask member's details, build record, generate bill | | X | | |
| Ask membership details, update expiry, generate bill | | | X | |
| Print cheque, delete record | | | | X |

Decision **tables** are better when many conditions combine; decision **trees** are easier to read when the order of decisions matters.
`,
          questions: [
            multi(
              'Which are requirements-gathering techniques?',
              ['Interviews', 'Task analysis', 'Form analysis', 'Unit testing'],
              [0, 1, 2],
              'Unit testing happens much later, in coding.',
              'easy',
            ),
            mcq(
              'One customer says "above 100 °C turn on the cooler" and another says "above 100 °C open the shower". This is…',
              ['incompleteness', 'inconsistency', 'over-specification', 'noise'],
              1,
              'The two requirements contradict each other.',
            ),
            mcq(
              'In a decision **table**, each column represents a…',
              ['condition', 'rule', 'module', 'test case only'],
              1,
              'A column gives one combination of conditions and the actions taken: a rule.',
            ),
            tf(
              'In a decision tree, the leaf nodes represent the actions to be performed.',
              true,
              'Edges are conditions; leaves are actions.',
              'easy',
            ),
            subj(
              'Draw a decision table for: "If a flight is more than half full and the ticket costs more than Rs 3,000, free meals are served unless it is a domestic flight. Meals are charged on all domestic flights."',
              `Conditions: **more than half full**, **cost > Rs 3,000**, **domestic**. Actions: **free meals**, **charged meals**, **no meals**.

| Conditions | R1 | R2 | R3 | R4 | R5 |
|---|---|---|---|---|---|
| Domestic flight | Yes | No | No | No | No |
| More than half full | – | Yes | Yes | No | No |
| Cost > Rs 3,000 | – | Yes | No | Yes | No |
| **Actions** | | | | | |
| Serve free meals | | X | | | |
| Charge for meals | X | | | | |
| No free meals | | | X | X | X |

(Domestic flights always charge for meals; international flights get free meals only when both other conditions hold.)`,
              'hard',
            ),
          ],
        },
      ],
      revision: `
- **RE** = find out, analyse, document and check requirements. User vs system requirements.
- **Functional** (what it does), **non-functional** (constraints: product, organisational, external), **domain**.
- Make requirements **verifiable** with measures (response time, MTTF, training time).
- **SRS:** what not how; black-box; uses — contract, design basis, estimates, testing, manual. Parts: functions, interfaces, non-functional, constraints.
- Good SRS: concise, unambiguous, complete, consistent, traceable, verifiable. Bad: noise, silence, over-specification, contradiction, ambiguity.
- **IEEE 830:** introduction, overall description, specific requirements.
- Gathering: documents, interviews, task, scenario and form analysis. Analysis removes **inconsistency, incompleteness, ambiguity**.
- **Decision tree:** edges = conditions, leaves = actions. **Decision table:** columns = rules.
`,
    },
  ],
};
