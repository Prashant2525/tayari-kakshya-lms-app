import { blank, match, mcq, multi, num, subj, tf } from '../questions.ts';
import type { PackCourse } from '../types.ts';

/** Operating Systems, Unit 1 (B.Tech CSE, Semester 5): original notes and questions (D-071). */
export const operatingSystems: PackCourse = {
  key: 'os',
  slug: 'operating-systems',
  title: { en: 'Operating Systems', ne: 'अपरेटिङ सिस्टम' },
  shortDescription: {
    en: 'What an operating system does, how it evolved, how a computer runs it, and how programs ask it for services.',
    ne: 'अपरेटिङ सिस्टमले के गर्छ, यसको विकास, कम्प्युटरले यसलाई कसरी चलाउँछ र प्रोग्रामले यसका सेवा कसरी माग्छन्।',
  },
  description: `
## What you will learn
This course covers the first unit of a university Operating Systems paper: the role of the operating system, its history, the hardware it runs on, how it is built, and the system-call interface programs use.

- **5 chapters** of clear notes with tables and worked examples
- A **PDF handout** for every chapter, to read offline
- **Chapter quizzes** and a timed **subject test** with explanations

## Who it is for
B.Tech / BE Computer Science students in Semester 5, and anyone preparing for OS questions in university or placement exams.

> The first chapter is free. Unlock the rest with the course or a plan.
`,
  semester: 'semester-5',
  isFeatured: true,
  popularityRank: 1,
  subject: {
    key: 'os-subject',
    name: { en: 'Operating Systems', ne: 'अपरेटिङ सिस्टम' },
    summary: {
      en: 'Unit 1: overview, evolution, computer-system organization, OS structure and operations, system calls.',
      ne: 'एकाइ १: परिचय, विकास, कम्प्युटर प्रणालीको संगठन, OS संरचना र सञ्चालन, सिस्टम कल।',
    },
  },
  chapters: [
    {
      key: 'os-ch1',
      numberLabel: '1',
      title: { en: 'Operating System Overview', ne: 'अपरेटिङ सिस्टमको परिचय' },
      description:
        'The parts of a computer system, the kinds of software, and what an operating system is for.',
      topics: [
        {
          key: 'os-ch1-t1',
          title: { en: 'Computer system and types of software', ne: 'कम्प्युटर प्रणाली र सफ्टवेयरका प्रकार' },
          estimatedMinutes: 15,
          note: `
## The four parts of a computer system
A computer system is easiest to understand as four layers, each serving the one above it:

| Layer | What it is | Examples |
|---|---|---|
| Hardware | The basic computing resources | CPU, memory (RAM), I/O devices such as disk, keyboard, display |
| Operating system | Controls the hardware and shares it among programs and users | Windows, Linux, macOS, Android |
| Application programs | Use the resources to solve users' problems | Word processor, web browser, compiler, spreadsheet |
| Users | People, or other machines, who use the system | Students, administrators, other computers |

The operating system sits between the hardware and the applications. Applications never drive the hardware directly; they ask the operating system to do it for them.

## What is software?
Software is a set of instructions (programs) together with the data and documentation needed to use them. Software tells the hardware *what* to do and *how* to do it.

### System software vs application software
| | System software | Application software |
|---|---|---|
| Purpose | Runs and manages the computer; a platform for other software | Performs a task the user wants done |
| Who uses it | Mostly the system and other programs | Directly by the user |
| Runs when | Starts with the computer and keeps running | When the user opens it |
| Examples | Operating system, device drivers, compilers, utilities | MS Word, VLC, Chrome, games |

> **Exam tip:** "System software is the interface between the hardware and application software" is a one-line definition examiners like.

## Key terms
- **Resource:** anything a program needs to run — CPU time, memory space, files, I/O devices.
- **Platform:** the hardware plus operating system an application runs on.
`,
          questions: [
            mcq(
              'Which layer of a computer system controls the hardware and coordinates its use among programs?',
              ['Application programs', 'Operating system', 'Users', 'Device controllers'],
              1,
              'The operating system controls the hardware and shares it among the application programs of the various users.',
              'easy',
            ),
            mcq(
              'Which of these is **application** software?',
              ['A device driver', 'The Linux kernel', 'A web browser', 'A boot loader'],
              2,
              'A web browser performs a task the user wants. Drivers, kernels and boot loaders are system software.',
              'easy',
            ),
            match(
              'Match each part of a computer system with an example.',
              [
                ['Hardware', 'CPU and memory'],
                ['Operating system', 'Linux'],
                ['Application program', 'Spreadsheet'],
              ],
              'Hardware provides resources, the OS manages them, applications use them for user tasks.',
              'easy',
            ),
            tf(
              'System software normally starts when the computer starts and keeps running in the background.',
              true,
              'System software such as the OS is loaded at boot and runs as long as the machine is on; applications run when the user opens them.',
            ),
          ],
        },
        {
          key: 'os-ch1-t2',
          title: { en: 'What an OS is, its functions and objectives', ne: 'OS के हो, यसका कार्य र उद्देश्य' },
          estimatedMinutes: 20,
          note: `
## Definitions
- An **operating system (OS)** is system software that manages the computer's hardware and software resources and provides common services to programs.
- Put simply, it is the **interface between the user and the hardware**.
- Because it decides who gets the CPU, memory and devices, and when, the OS is often described as a **resource allocator**. It is also a **control program** that prevents errors and improper use.

## Functions of an operating system
1. **Process management** — creates, schedules and ends processes (programs in execution).
2. **Memory management** — keeps track of which parts of memory are in use and by whom; allocates and frees memory.
3. **Device (I/O) management** — drives devices through device drivers and controllers.
4. **File (storage) management** — organises data into files and directories and controls access to them.
5. **Security and protection** — passwords, permissions, and isolation of one program from another.
6. **Job accounting** — records how much CPU time and other resources each user or job used.
7. **Networking** — lets the computer communicate with others.
8. **Error detection** — watches for hardware and software errors and responds to them.
9. **System calls** — the interface through which programs request all of the above.
10. **Virtualisation** — presents one physical machine as several virtual ones.

## Objectives (goals) of an OS
| Objective | Meaning |
|---|---|
| Convenience | The computer is easy and pleasant to use |
| Efficiency | Hardware is used well; little is wasted |
| Ability to evolve | New features and hardware can be added without disruption |
| Fair sharing | Every program and user gets a reasonable share of resources |
| Control and monitoring | Resources are used correctly and safely |

> **Remember:** functions are *what the OS does*; objectives are *why it does it*.
`,
          questions: [
            mcq(
              'An operating system is often called a **resource allocator** because it…',
              [
                'compiles programs into machine code',
                'decides how the CPU, memory and devices are shared among programs',
                'stores files on disk',
                'connects the computer to the internet',
              ],
              1,
              'Deciding which program gets which resource, and when, is resource allocation.',
              'easy',
            ),
            multi(
              'Which of the following are **functions** of an operating system? (Choose all that apply.)',
              [
                'Memory management',
                'Writing application code',
                'Process management',
                'File management',
                'Designing CPUs',
              ],
              [0, 2, 3],
              'Process, memory and file management are core OS functions. Writing apps and designing chips are not done by the OS.',
            ),
            tf(
              'Job accounting means the operating system keeps a record of the resources used by each job or user.',
              true,
              'Job accounting tracks CPU time, memory and other resources used, which is useful for billing and tuning.',
            ),
            blank(
              'The operating system acts as an [[b1]] between the user and the computer hardware.',
              { b1: ['interface', 'intermediary'] },
              'The OS sits between the user (and applications) and the hardware.',
              'easy',
            ),
            subj(
              'Distinguish between the functions and the objectives of an operating system, giving three examples of each.',
              `**Functions** are the jobs the OS performs; **objectives** are the goals those jobs serve.

- Functions: process management, memory management, file management (also device management, security, accounting).
- Objectives: convenience for the user, efficient use of hardware, ability to evolve (also fair sharing, control).`,
            ),
          ],
        },
      ],
      revision: `
- A computer system = **hardware + operating system + application programs + users**.
- **System software** runs and manages the computer; **application software** does the user's task.
- The OS is the **interface** between user and hardware, a **resource allocator** and a **control program**.
- Functions: process, memory, device, file management; security; accounting; networking; error detection; system calls.
- Objectives: convenience, efficiency, ability to evolve, fair sharing, control.
`,
    },
    {
      key: 'os-ch2',
      numberLabel: '2',
      title: { en: 'Evolution of Operating Systems', ne: 'अपरेटिङ सिस्टमको विकास' },
      description:
        'From machines with no OS to batch, multiprogramming, time-sharing, GUI, network, mobile and AI-assisted systems.',
      topics: [
        {
          key: 'os-ch2-t1',
          title: {
            en: 'Batch, multiprogramming and time-sharing',
            ne: 'ब्याच, मल्टिप्रोग्रामिङ र टाइम-सेयरिङ',
          },
          estimatedMinutes: 20,
          note: `
## Before operating systems
The earliest computers (before about 1950) had **no operating system**. Programmers loaded programs by hand using switches, plugboards or punched cards, and each user booked the whole machine. The CPU sat idle while people set up the next job.

## Batch processing systems
- An **operator** collects jobs with similar needs and runs them together as a **batch**.
- Users hand in jobs (often on punched cards) and collect output later; there is **no interaction** while a job runs.
- **Problem:** the CPU is still idle whenever a job waits for slow I/O such as a card reader or printer.

## Multiprogramming systems
- **Several programs are kept in memory at once.** When the running program waits for I/O, the OS switches the CPU to another program.
- Goal: **keep the CPU busy**, increasing CPU utilisation and throughput.
- Needs job scheduling (which jobs to bring into memory), CPU scheduling (which ready job runs next) and memory management.
- Two common forms: **multitasking** (one user runs many tasks) and **multiuser** (many users share one system).

## Time-sharing (multitasking) systems
- A logical extension of multiprogramming: the CPU switches between jobs **so often** (every few milliseconds) that each user can **interact** with their program while it runs.
- Each task gets a small, equal slice of CPU time called a **time quantum**.
- Goal: **short response time**, so many users feel they each have their own computer.

| | Batch | Multiprogramming | Time-sharing |
|---|---|---|---|
| Main goal | Automate job-to-job transition | Maximise CPU use | Minimise response time |
| User interaction | None while running | Little | Yes, interactive |
| Switching happens | After a job ends | When a job waits for I/O | Every time quantum (and on I/O) |
`,
          questions: [
            mcq(
              'What is the main goal of a **multiprogramming** operating system?',
              [
                'Minimise response time',
                'Keep the CPU busy by switching jobs when one waits for I/O',
                'Support graphical interfaces',
                'Run on mobile devices',
              ],
              1,
              'Multiprogramming keeps several jobs in memory so the CPU always has something to run while one job waits.',
              'easy',
            ),
            mcq(
              'In a time-sharing system, each process gets a small fixed share of CPU time called a…',
              ['page', 'time quantum', 'buffer', 'batch'],
              1,
              'The time quantum (time slice) is the CPU time a process gets before the CPU switches to another one.',
              'easy',
            ),
            tf(
              'In a batch system, users can interact with their jobs while the jobs are running.',
              false,
              'Batch jobs run without user interaction; output is collected after the batch finishes.',
            ),
            match(
              'Match each type of system with its main goal.',
              [
                ['Batch', 'Run similar jobs together without operator delay between them'],
                ['Multiprogramming', 'Maximise CPU utilisation'],
                ['Time-sharing', 'Short response time for interactive users'],
              ],
              'Each generation fixed a weakness of the one before it.',
            ),
          ],
        },
        {
          key: 'os-ch2-t2',
          title: {
            en: 'GUI, network, mobile and AI-era systems',
            ne: 'GUI, नेटवर्क, मोबाइल र AI युगका प्रणाली',
          },
          estimatedMinutes: 15,
          note: `
## A timeline of operating systems
| Period (approx.) | Generation | What changed |
|---|---|---|
| Before 1940s–1950 | No OS | Programs loaded by hand; one user owns the machine |
| 1950s | Batch processing | Jobs grouped into batches and run by an operator |
| 1960s | Multiprogramming | Several jobs in memory; CPU switched on I/O waits |
| 1960s–1970s | Time-sharing | Many interactive users share one computer |
| 1970s–1980s | GUI operating systems | Windows, icons, menus and a mouse instead of typed commands |
| 1980s–1990s | Network operating systems | Built-in support for sharing files and printers over a network |
| Late 1990s–2000s | Mobile operating systems | Touch, battery management, sensors, app stores (Android, iOS) |
| 2010s onward | AI-integrated systems | Assistants, smart power and resource management, predictive features |

## GUI operating systems
A **graphical user interface** lets people work with windows, icons, menus and a pointer (WIMP) rather than memorising commands. This made computers usable by non-experts.

## Network operating systems
A **network OS** includes the software and protocols to let autonomous computers share files, printers and services over a network, conveniently and cheaply. Examples: Windows Server, Linux servers.

## Mobile operating systems
A **mobile OS** is the platform for smartphones and tablets. It adds touch input, sensors (GPS, camera), strong power management, and app distribution. Examples: **Android**, **iOS**.

## AI-integrated operating systems
Modern systems increasingly build AI into the OS itself — voice assistants, on-device recognition, predicting which apps to keep in memory, and adapting power and performance to how you use the device.

> **Exam tip:** a neat answer to "Explain the evolution of operating systems" lists the generations in order with one line on what each added.
`,
          questions: [
            mcq(
              'Which of these is a **mobile** operating system?',
              ['Windows Server', 'Android', 'MS-DOS', 'Unix System V'],
              1,
              'Android (and iOS) are mobile operating systems built for phones and tablets.',
              'easy',
            ),
            tf(
              'A network operating system includes software and protocols for computers to share files and printers over a network.',
              true,
              'That is exactly what distinguishes a network OS.',
            ),
            mcq(
              'What did GUI operating systems mainly improve?',
              [
                'Raw CPU speed',
                'Ease of use through windows, icons, menus and a pointer',
                'Batch throughput',
                'Disk capacity',
              ],
              1,
              'GUIs replaced typed commands with visual interaction, making computers usable by non-experts.',
              'easy',
            ),
            subj(
              'Briefly trace the evolution of operating systems from the earliest computers to the present.',
              `1. **No OS** — programs loaded by hand.
2. **Batch** — similar jobs run together by an operator.
3. **Multiprogramming** — several jobs in memory; CPU switches on I/O waits.
4. **Time-sharing** — fast switching so many users interact at once.
5. **GUI** — windows, icons, menus, pointer.
6. **Network OS** — sharing over networks.
7. **Mobile OS** — touch, sensors, power management, app stores.
8. **AI-integrated** — assistants and smart resource management.`,
            ),
          ],
        },
      ],
      revision: `
- **No OS → Batch → Multiprogramming → Time-sharing → GUI → Network → Mobile → AI-integrated.**
- Batch: no interaction; CPU idle during I/O.
- Multiprogramming: several jobs in memory; goal = **CPU utilisation**.
- Time-sharing: frequent switching with a **time quantum**; goal = **response time**.
- GUI made computers easy to use; network OS added sharing; mobile OS added touch, sensors and power management.
`,
    },
    {
      key: 'os-ch3',
      numberLabel: '3',
      title: { en: 'Computer-System Organization', ne: 'कम्प्युटर प्रणालीको संगठन' },
      description:
        'Booting, the instruction cycle, interrupts, the storage hierarchy, I/O with DMA, and system architectures.',
      topics: [
        {
          key: 'os-ch3-t1',
          title: {
            en: 'Booting, the instruction cycle and interrupts',
            ne: 'बुटिङ, इन्स्ट्रक्सन साइकल र इन्टरप्ट',
          },
          estimatedMinutes: 25,
          note: `
## How a computer starts
A general-purpose computer has one or more CPUs and several **device controllers** connected by a common **bus** to shared memory.

1. When power comes on, the CPU runs a small **bootstrap program** stored in firmware (ROM/EEPROM).
2. The bootstrap program initialises the hardware, finds the **OS kernel** on disk and loads it into memory.
3. The kernel starts running and starts **system processes (daemons)** — background services such as logging, networking and scheduling — that run for as long as the system is up.
4. The system then waits for events.

## The instruction execution cycle
For every instruction in a program, the CPU repeats:

1. **Fetch** — read the instruction from memory at the address in the **program counter (PC)** into the **instruction register (IR)**; advance the PC.
2. **Decode** — work out what the instruction means.
3. **Execute** — carry it out.
4. **Write back** — store the result if needed.

## Interrupts
An **interrupt** is a signal that an event needs the CPU's immediate attention.

| Type | Raised by | Example |
|---|---|---|
| Hardware interrupt | A device, through a signal on the bus | Keyboard key pressed, disk read finished |
| Software interrupt (trap) | A program, by a special instruction or an error | A **system call**, division by zero |

Hardware interrupts are further **maskable** (can be ignored for a while) or **non-maskable** (must be handled, e.g. a hardware failure).

### Handling an interrupt
1. The CPU finishes the current instruction and **saves the state** (PC, registers) of the running process.
2. It looks up the right handler in the **interrupt vector** — a table in low memory holding the addresses of the **interrupt service routines (ISRs)**, indexed by interrupt number.
3. The **ISR** runs and deals with the event.
4. The saved state is restored and the interrupted program **resumes** as if nothing happened.

> **Why a vector table?** Interrupts must be handled quickly. Jumping straight to the ISR's address through a table is much faster than searching for the right routine.
`,
          questions: [
            mcq(
              'Where is the **bootstrap program** usually stored?',
              ['In RAM', 'In firmware such as ROM or EEPROM', 'On a USB stick', 'In the CPU cache'],
              1,
              'The bootstrap program must survive power-off, so it lives in non-volatile firmware.',
              'easy',
            ),
            mcq(
              'What does the **interrupt vector** contain?',
              [
                'The saved registers of every process',
                'Addresses of the interrupt service routines',
                'The list of ready processes',
                'The contents of the cache',
              ],
              1,
              'The interrupt vector is a table of pointers to ISRs, indexed by interrupt number.',
            ),
            match(
              'Match each step of the instruction cycle with what happens.',
              [
                ['Fetch', 'Instruction is read into the IR using the PC'],
                ['Decode', 'The meaning of the instruction is worked out'],
                ['Execute', 'The operation is carried out'],
                ['Write back', 'The result is stored'],
              ],
              'Fetch–decode–execute (–write back) repeats for every instruction.',
            ),
            tf(
              'A system call is an example of a software interrupt (trap).',
              true,
              'A program executes a special instruction to request an OS service, which traps into the kernel.',
            ),
            blank(
              'Background processes started at boot that provide services, such as logging and networking, are called system [[b1]].',
              { b1: ['daemons', 'daemon'] },
              'Daemons run continuously in the background.',
            ),
          ],
        },
        {
          key: 'os-ch3-t2',
          title: { en: 'Storage hierarchy, I/O and DMA', ne: 'स्टोरेज पदानुक्रम, I/O र DMA' },
          estimatedMinutes: 20,
          note: `
## Storage structure
Memory is an array of bytes, each with its own address. The CPU moves data with two instructions:

- **load** — copy a byte or word from main memory into a CPU register;
- **store** — copy a register's contents into main memory.

## The storage hierarchy
Storage systems differ in **speed, cost, size and volatility**, so computers combine several kinds:

| Level (fastest first) | Typical size | Volatile? |
|---|---|---|
| Registers | Bytes | Yes |
| Cache | Kilobytes–megabytes | Yes |
| Main memory (RAM) | Gigabytes | Yes |
| Solid-state disk | Hundreds of GB–TB | No |
| Magnetic (hard) disk | Terabytes | No |
| Optical disk | Gigabytes | No |
| Magnetic tape | Terabytes, for archives | No |

Going **down** the hierarchy: slower, cheaper per byte, larger, and non-volatile. Going **up**: faster and more expensive.

## I/O structure
- Each **device controller** has local buffer storage and special-purpose registers, and moves data between its device and that buffer.
- The OS has a **device driver** for each controller. To start an I/O operation, the driver loads the controller's registers; the controller does the transfer and raises an **interrupt** when it finishes.
- A single SCSI controller can serve seven or more devices.

### Direct Memory Access (DMA)
Interrupt-driven I/O raises one interrupt per small transfer, which is fine for a keyboard but wasteful for disks. With **DMA**, the controller transfers a whole **block of data directly between the device and main memory**, without the CPU, and raises **one interrupt per block**. The CPU is free to do other work meanwhile.
`,
          questions: [
            mcq(
              'Which storage is the **fastest**?',
              ['Main memory', 'Cache', 'Registers', 'Solid-state disk'],
              2,
              'Registers sit inside the CPU and are the fastest (and smallest) storage.',
              'easy',
            ),
            multi(
              'Which of these storage types are **volatile** (lose data without power)?',
              ['Registers', 'Cache', 'Main memory (RAM)', 'Magnetic disk', 'Magnetic tape'],
              [0, 1, 2],
              'Registers, cache and RAM need power; disks and tape keep data.',
            ),
            mcq(
              'Why is **DMA** used for bulk transfers such as disk I/O?',
              [
                'It makes the CPU run at a higher clock speed',
                'The controller moves a whole block to memory and interrupts once, freeing the CPU',
                'It removes the need for device drivers',
                'It stores data permanently',
              ],
              1,
              'DMA avoids one interrupt per byte or word; the CPU is interrupted once per block.',
            ),
            tf(
              'Moving down the storage hierarchy, storage becomes cheaper per byte and larger, but slower.',
              true,
              'That trade-off is why systems use several levels.',
            ),
            blank(
              'The [[b1]] instruction copies a word from main memory into a CPU register.',
              { b1: ['load'] },
              'Load brings data in; store writes it back to memory.',
              'easy',
            ),
          ],
        },
        {
          key: 'os-ch3-t3',
          title: { en: 'Computer-system architecture', ne: 'कम्प्युटर प्रणाली संरचना' },
          estimatedMinutes: 15,
          note: `
## Classified by the number of processors
### Single-processor systems
One main general-purpose CPU executes user programs. (There may be special-purpose processors in devices, such as a disk controller, but they do not run user processes.)

### Multiprocessor systems (parallel or multicore systems)
Two or more CPUs share the bus, memory and devices. Advantages:

1. **Increased throughput** — more work done in less time (though N processors give less than N times the speed because of coordination overhead).
2. **Economy of scale** — sharing power supplies, memory and devices costs less than several separate computers.
3. **Increased reliability** — if one processor fails, the others can continue (graceful degradation).

Multiprocessors are either **asymmetric** (a boss processor assigns work to the others) or **symmetric (SMP)** (every processor does all tasks, as in today's multicore chips).

### Clustered systems
Two or more **separate computers (nodes)**, joined by a network and usually sharing storage, work together. Clusters give **high availability** — if one node fails, another takes over its work — and can provide **high-performance computing** by running parts of a job in parallel.

| | Multiprocessor | Cluster |
|---|---|---|
| Unit | Several CPUs in one machine | Several complete computers |
| Coupling | Tight (shared memory) | Loose (network) |
| Main benefit | Throughput | Availability (and scale) |
`,
          questions: [
            multi(
              'Which are advantages of **multiprocessor** systems?',
              [
                'Increased throughput',
                'Economy of scale',
                'Increased reliability',
                'No need for an operating system',
              ],
              [0, 1, 2],
              'Throughput, economy of scale and reliability are the three classic advantages.',
            ),
            mcq(
              "A system of separate computers joined by a network that take over each other's work when one fails is a…",
              ['single-processor system', 'clustered system', 'batch system', 'real-time system'],
              1,
              'Clusters are loosely coupled computers that provide high availability.',
              'easy',
            ),
            tf(
              'In symmetric multiprocessing (SMP), one boss processor assigns work to all the other processors.',
              false,
              'That describes asymmetric multiprocessing. In SMP every processor performs all tasks.',
            ),
          ],
        },
      ],
      revision: `
- **Boot:** firmware bootstrap → loads the kernel → kernel starts daemons → waits for events.
- **Instruction cycle:** fetch (PC → IR), decode, execute, write back.
- **Interrupts:** hardware or software (traps, system calls); handled by an **ISR** found through the **interrupt vector**; state is saved and restored.
- **Storage hierarchy:** registers > cache > RAM > SSD > disk > optical > tape (fast → slow, costly → cheap, volatile → non-volatile).
- **DMA:** controller moves a block directly to memory; one interrupt per block.
- **Architectures:** single-processor; multiprocessor (throughput, economy, reliability; SMP vs asymmetric); clustered (high availability).
`,
    },
    {
      key: 'os-ch4',
      numberLabel: '4',
      title: { en: 'OS Structure and Operations', ne: 'OS संरचना र सञ्चालन' },
      description: 'Multiprogramming and scheduling, kernel designs, dual-mode operation and the timer.',
      topics: [
        {
          key: 'os-ch4-t1',
          title: {
            en: 'Multiprogramming, scheduling and OS structures',
            ne: 'मल्टिप्रोग्रामिङ, शेड्युलिङ र OS संरचना',
          },
          estimatedMinutes: 25,
          note: `
## Why structure matters
One of the most important things an OS does is **multiprogramming**: organising jobs so the CPU always has one to run. Because main memory cannot hold every job, jobs wait on disk in a **job pool**.

- A program loaded into memory and running is a **process**.
- **Job scheduling** chooses which jobs from the pool to bring into memory.
- **CPU scheduling** chooses which ready process runs next.
- **Memory management** keeps several processes in memory safely at once.
- In **time-sharing**, the CPU switches so often that users interact with running programs.

## Ways to build an operating system
| Structure | Idea | Pros | Cons |
|---|---|---|---|
| Monolithic (simple) | The whole OS is one large kernel program | Fast — little overhead | Hard to maintain; one bug can crash everything |
| Layered | OS split into layers; each uses only the layer below | Easy to debug and verify | Hard to define layers; slower (passing through layers) |
| Microkernel | Only essentials (IPC, scheduling, basic memory) in the kernel; services run as user processes | Reliable, secure, easy to extend | Slower — many messages between services |
| Hybrid kernel | Mixes monolithic speed with microkernel modularity | Balanced | More complex design |
| Modular | Core kernel plus loadable modules (e.g. drivers) | Flexible; load only what you need | Modules share kernel space |
| Exokernel | Kernel only multiplexes hardware securely; apps manage resources | Very efficient for specialised apps | Complex for application writers |
| Virtual machines | Software makes one machine look like several | Isolation; run different OSs | Overhead of virtualisation |

> **Examples to quote:** early UNIX and MS-DOS were monolithic; Mach and QNX use microkernels; Windows NT and macOS (XNU) are hybrid; Linux is monolithic with loadable modules.
`,
          questions: [
            mcq(
              'Which OS structure keeps only essential services (IPC, scheduling, basic memory) in the kernel and runs the rest as user processes?',
              ['Monolithic', 'Microkernel', 'Layered', 'Batch'],
              1,
              'A microkernel moves most services out of the kernel, improving reliability at some speed cost.',
            ),
            mcq(
              'Which scheduler decides which jobs from the job pool are brought into memory?',
              ['CPU scheduler', 'Job scheduler', 'Disk scheduler', 'Interrupt handler'],
              1,
              'The job (long-term) scheduler selects jobs to load into memory; the CPU scheduler picks the next one to run.',
            ),
            tf(
              'A main disadvantage of a monolithic kernel is that a bug in any part can crash the whole system.',
              true,
              'Everything runs in one kernel address space, so faults are not isolated.',
            ),
            match(
              'Match each OS structure with its key idea.',
              [
                ['Layered', 'Each part uses only the services of the part below it'],
                ['Modular', 'Core kernel plus loadable modules'],
                ['Virtual machine', 'One physical machine appears as several'],
              ],
              'These are three of the common ways to organise an OS.',
            ),
          ],
        },
        {
          key: 'os-ch4-t2',
          title: { en: 'Dual-mode operation and the timer', ne: 'डुअल-मोड सञ्चालन र टाइमर' },
          estimatedMinutes: 20,
          note: `
## Interrupt-driven operation
Modern operating systems are **interrupt driven**: when there is nothing to do, the OS waits. Events are signalled by **interrupts** (from devices) or **traps/exceptions** (software-generated — an error such as division by zero, or a request for an OS service).

## Dual-mode operation
To protect itself and other programs from faulty or malicious code, the CPU runs in one of two modes:

| | User mode | Kernel mode (supervisor / system / privileged mode) |
|---|---|---|
| Who runs | Application code | Operating-system code |
| Access | Restricted | Full access to hardware and memory |
| Privileged instructions | Not allowed — attempting one causes a trap | Allowed |
| Mode bit | **1** | **0** |

- A hardware **mode bit** records the current mode.
- When a program needs an OS service (a **system call**) or an interrupt occurs, the CPU **switches to kernel mode**; when the OS returns control, it **switches back to user mode**. This is a **mode switch**.
- **Privileged instructions** — such as I/O control, timer management and interrupt management — can run only in kernel mode.

### Multimode operation
Some CPUs support more than two modes, for example a separate mode for a **hypervisor** managing virtual machines, or several privilege levels (rings).

## The timer
If a program loops forever it could keep the CPU and never return control to the OS. A **timer** prevents this:

- The OS sets the timer to interrupt after a period (a **fixed** or **variable** timer).
- When it fires, control returns to the OS, which can switch to another process (**preemption**) or end the runaway one.
- Setting the timer is a privileged instruction.
`,
          questions: [
            mcq(
              'What value of the **mode bit** indicates kernel mode?',
              ['0', '1', '2', 'It has no mode bit'],
              0,
              'Mode bit 0 = kernel mode, 1 = user mode.',
              'easy',
            ),
            num(
              'In the usual convention, the mode bit is set to which number while user code is running?',
              1,
              'User mode is indicated by mode bit 1.',
              'easy',
            ),
            mcq(
              'What is the purpose of the **timer** in an operating system?',
              [
                'To keep the system clock accurate',
                'To make sure the OS regains control from a program that would otherwise run forever',
                'To speed up the CPU',
                'To schedule disk writes',
              ],
              1,
              'The timer interrupt returns control to the OS so it can preempt or stop a process.',
            ),
            tf(
              'A user-mode program that tries to execute a privileged instruction causes a trap to the operating system.',
              true,
              'The hardware treats the attempt as illegal and traps to the OS.',
            ),
            subj(
              'Explain dual-mode operation and why it is needed.',
              `The CPU has a **mode bit**: kernel mode (0) runs OS code with full access; user mode (1) runs applications with restricted access. **Privileged instructions** run only in kernel mode. A system call or interrupt switches to kernel mode; returning to the program switches back.

It is needed to **protect** the OS and other programs from errant or malicious user code — a user program cannot directly control devices, interrupts or the timer.`,
            ),
          ],
        },
      ],
      revision: `
- Multiprogramming needs **job scheduling, CPU scheduling and memory management**; a running program is a **process**.
- Structures: **monolithic, layered, microkernel, hybrid, modular, exokernel, virtual machines** — know one pro and one con of each.
- Modern OSs are **interrupt driven**; a **trap** is a software interrupt (error or system call).
- **Dual mode:** kernel (mode bit 0, privileged) and user (mode bit 1, restricted); **mode switch** on system calls and interrupts.
- **Timer:** guarantees the OS gets control back; enables preemption.
`,
    },
    {
      key: 'os-ch5',
      numberLabel: '5',
      title: { en: 'System Calls and System Programs', ne: 'सिस्टम कल र सिस्टम प्रोग्राम' },
      description:
        'How programs request OS services, how parameters are passed, the kinds of system calls, and system utilities.',
      topics: [
        {
          key: 'os-ch5-t1',
          title: { en: 'System calls and the API', ne: 'सिस्टम कल र API' },
          estimatedMinutes: 25,
          note: `
## What a system call is
A **system call** is the programming interface to the services of the operating system. Every time a program reads a file, creates a process or allocates memory, it ends up making system calls. They are typically written in C/C++ (some low-level ones in assembly).

### Example: copying one file to another
Even a tiny copy program makes many system calls: get the file names, **open** the input file, **create** the output file, loop **read** / **write**, handle errors, **close** both files, **exit**.

## The Application Programming Interface (API)
Programmers rarely make system calls directly. They call functions in an **API**, which in turn makes the system calls:

- **Windows API** — for Windows systems;
- **POSIX API** — for UNIX, Linux and macOS;
- **Java API** — for programs on the Java Virtual Machine.

Why use an API? Programs become **portable** (the same API on many systems) and **simpler** to write than raw system calls.

## The system-call interface
The run-time library provides a **system-call interface**. Each system call has a **number**; the interface keeps a **table indexed by these numbers**, finds the right one, switches to kernel mode, runs it and returns the status and any results. The caller does not need to know how the call is implemented.

## Passing parameters to the OS
| Method | How | Note |
|---|---|---|
| Registers | Parameters placed in CPU registers | Fast, but only a few parameters fit |
| Block (table) in memory | Parameters stored in memory; the **address** of the block goes in a register | Used by Linux and Solaris; any number of parameters |
| Stack | Program **pushes** parameters; the OS **pops** them | Any number of parameters |
`,
          questions: [
            mcq(
              'Which API is used by programs on UNIX, Linux and macOS?',
              ['Win32 API', 'POSIX API', 'Java API', 'DirectX'],
              1,
              'POSIX is the standard API of UNIX-like systems.',
              'easy',
            ),
            multi(
              'Which are methods of passing parameters to the operating system in a system call?',
              ['Registers', 'A block of memory whose address is in a register', 'The stack', 'Email'],
              [0, 1, 2],
              'Registers, a memory block (table) and the stack are the three methods.',
              'easy',
            ),
            mcq(
              'How does the system-call interface find the right system call?',
              [
                'By searching the file system',
                'Using a table indexed by the system-call number',
                'By asking the user',
                'Through the interrupt vector of the disk',
              ],
              1,
              'Each system call has a number that indexes a table in the system-call interface.',
            ),
            tf(
              'Application programmers usually call API functions rather than invoking system calls directly.',
              true,
              'APIs are portable and easier to use; they make the system calls underneath.',
            ),
          ],
        },
        {
          key: 'os-ch5-t2',
          title: {
            en: 'Types of system calls and system programs',
            ne: 'सिस्टम कलका प्रकार र सिस्टम प्रोग्राम',
          },
          estimatedMinutes: 20,
          note: `
## Six categories of system calls
| Category | What it covers | UNIX examples | Windows examples |
|---|---|---|---|
| Process control | Create, end, load, execute, wait | \`fork()\`, \`exit()\`, \`wait()\` | \`CreateProcess()\`, \`ExitProcess()\`, \`WaitForSingleObject()\` |
| File manipulation | Create, delete, open, read, write, close | \`open()\`, \`read()\`, \`write()\`, \`close()\` | \`CreateFile()\`, \`ReadFile()\`, \`WriteFile()\`, \`CloseHandle()\` |
| Device manipulation | Request, release, read, write devices | \`ioctl()\`, \`read()\`, \`write()\` | \`SetConsoleMode()\`, \`ReadConsole()\` |
| Information maintenance | Get/set time, date, system data | \`getpid()\`, \`alarm()\`, \`sleep()\` | \`GetCurrentProcessID()\`, \`SetTimer()\`, \`Sleep()\` |
| Communications | Create connections, send and receive messages, shared memory | \`pipe()\`, \`shm_open()\`, \`mmap()\` | \`CreatePipe()\`, \`CreateFileMapping()\` |
| Protection | Control access to resources | \`chmod()\`, \`umask()\`, \`chown()\` | \`SetFileSecurity()\` |

## System programs (system utilities)
**System programs** provide a convenient environment for developing and running programs. Most users see the OS through them rather than through system calls.

| Category | Purpose | Examples |
|---|---|---|
| File management | Create, copy, move, delete, list files | \`cp\`, \`mv\`, \`rm\`, \`ls\` |
| Status information | Date, time, memory, disk space, users, performance | \`who\`, \`top\`, \`df\` |
| File modification | Text editors and tools that change file contents | \`vi\`, \`nano\`, \`awk\` |
| Programming-language support | Compilers, interpreters, debuggers | \`gcc\`, \`java\`, \`python\` |
| Program loading and execution | Loaders, linkers | \`ld\` |
| Communications | Connections between processes, users and computers | \`ssh\`, \`netstat\`, \`telnet\` |
| Background services | Services started at boot and kept running | \`cron\`, \`sshd\` |
`,
          questions: [
            match(
              'Match each system call with its category.',
              [
                ['fork()', 'Process control'],
                ['read()', 'File manipulation'],
                ['getpid()', 'Information maintenance'],
                ['chmod()', 'Protection'],
              ],
              'fork creates a process; read reads a file; getpid gets process information; chmod changes access rights.',
              'medium',
              ['Communications'],
            ),
            mcq(
              '`pipe()` and `shm_open()` belong to which category of system calls?',
              ['Process control', 'Communications', 'Protection', 'Device manipulation'],
              1,
              'Pipes and shared memory let processes communicate.',
            ),
            mcq(
              'Which is a **status information** system program?',
              ['cp', 'top', 'gcc', 'vi'],
              1,
              '`top` shows running processes and resource use; cp copies files, gcc compiles, vi edits.',
              'easy',
            ),
            num(
              'Into how many major categories are system calls usually grouped?',
              6,
              'Process control, file manipulation, device manipulation, information maintenance, communications and protection.',
              'easy',
            ),
            tf(
              '`cron` is an example of a background-service system program.',
              true,
              'cron runs scheduled jobs in the background.',
            ),
          ],
        },
      ],
      revision: `
- A **system call** is the interface to OS services; programmers usually use an **API** (Windows, POSIX, Java).
- The **system-call interface** finds calls through a table indexed by **call number**.
- Parameters pass in **registers**, a **memory block** (address in a register) or on the **stack**.
- Six categories: **process control, file manipulation, device manipulation, information maintenance, communications, protection**.
- **System programs:** file management, status information, file modification, language support, loading and execution, communications, background services.
`,
    },
  ],
};
