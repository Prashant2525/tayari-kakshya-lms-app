import { blank, match, mcq, multi, num, subj, tf } from '../questions.ts';
import type { PackCourse } from '../types.ts';

/** Introduction to Multimedia (B.Tech CSE, Semester 6): original notes and questions (D-071). */
export const multimedia: PackCourse = {
  key: 'mm',
  slug: 'introduction-to-multimedia',
  title: { en: 'Introduction to Multimedia', ne: 'मल्टिमिडियाको परिचय' },
  shortDescription: {
    en: 'Media elements, hypertext and hypermedia, interactive multimedia, where multimedia is used, and careers in it.',
    ne: 'मिडिया तत्व, हाइपरटेक्स्ट र हाइपरमिडिया, अन्तरक्रियात्मक मल्टिमिडिया, यसको प्रयोग र करियर।',
  },
  description: `
## What you will learn
A short, friendly introduction to multimedia:

- The five media elements and what "digitised" multimedia means
- Hypertext and hypermedia, linear and non-linear navigation, interactivity
- Why multimedia helps people learn and remember
- Where multimedia is used — business, school, home, public places, the web and mobile
- The jobs people do on multimedia projects

Two chapters with **PDF handouts**, quizzes and a timed **subject test**.

> The first chapter is free.
`,
  semester: 'semester-6',
  isFeatured: false,
  popularityRank: 5,
  subject: {
    key: 'mm-subject',
    name: { en: 'Multimedia Systems', ne: 'मल्टिमिडिया प्रणाली' },
    summary: {
      en: 'Media elements, hypermedia, interactivity, applications and careers in multimedia.',
      ne: 'मिडिया तत्व, हाइपरमिडिया, अन्तरक्रियात्मकता, प्रयोग र करियर।',
    },
  },
  chapters: [
    {
      key: 'mm-ch1',
      numberLabel: '1',
      title: { en: 'Multimedia Fundamentals', ne: 'मल्टिमिडियाका आधारभूत कुरा' },
      description: 'What multimedia is, its elements, hypertext and hypermedia, and interactive multimedia.',
      topics: [
        {
          key: 'mm-ch1-t1',
          title: { en: 'What multimedia is', ne: 'मल्टिमिडिया के हो' },
          estimatedMinutes: 15,
          note: `
## Definition
**Multimedia** simply means using **more than one media element** together. **Web-based multimedia** is an online, interactive experience that combines two or more media elements — and **interactivity**, giving the user some control, is one of its key features.

## The five media elements
| Element | Examples |
|---|---|
| **Text** | Headings, paragraphs, captions, labels |
| **Graphics / images** | Photos, drawings, charts, icons |
| **Animation** | Moving graphics, 2-D and 3-D animation, transitions |
| **Sound / audio** | Music, narration, sound effects |
| **Video** | Recorded or live moving pictures |

A **multimedia application** uses a collection of these sources — text, graphics, images, sound, animation and/or video.

## Digitised multimedia
Today the elements are combined by **digitising** them — capturing each medium in a code (binary data) the computer understands — and then editing and combining them with software.

## Examples of multimedia applications
- The **World Wide Web**
- Multimedia **authoring** tools (e.g. Adobe Director)
- **Hypermedia courseware** and e-learning
- **Video** production and digital video editing
- **Interactive TV** and video on demand
- **Computer games**
- **Virtual reality**
- **Multimedia database** systems
`,
          questions: [
            num(
              'How many basic media elements are usually listed for multimedia?',
              5,
              'Text, graphics, animation, sound and video.',
              'easy',
            ),
            multi(
              'Which of these are media elements of multimedia?',
              ['Text', 'Animation', 'Video', 'Electricity'],
              [0, 1, 2],
              'The elements are text, graphics, animation, sound and video.',
              'easy',
            ),
            mcq(
              'What does it mean that multimedia is **digitised**?',
              [
                'It is printed on paper',
                'Each medium is captured in a code the computer can understand and process',
                'It is only shown on television',
                'It uses only text',
              ],
              1,
              'Digitising turns media into data that software can edit and combine.',
              'easy',
            ),
            tf(
              'Interactivity, which gives the user some control over the content, is a key feature of web-based multimedia.',
              true,
              'Users become active participants.',
              'easy',
            ),
            multi(
              'Which of these are multimedia applications?',
              ['Computer games', 'Virtual reality', 'Interactive TV', 'A plain calculator'],
              [0, 1, 2],
              'Games, VR and interactive TV combine several media.',
            ),
          ],
        },
        {
          key: 'mm-ch1-t2',
          title: {
            en: 'Hypertext, hypermedia and interactivity',
            ne: 'हाइपरटेक्स्ट, हाइपरमिडिया र अन्तरक्रियात्मकता',
          },
          estimatedMinutes: 20,
          note: `
## Hypertext
**Hypertext** is text that contains **links** to other texts. The term was coined by **Ted Nelson around 1965**. Moving through hypertext is usually **non-linear** — readers follow links in whatever order they choose, rather than reading from start to finish.

## Hypermedia
**Hypermedia** extends hypertext beyond text: links can lead to and from **graphics, images, sound and video** — including the continuous media, sound and video.

**Examples:** the **World Wide Web** (the best-known hypermedia application), PowerPoint presentations, PDF documents with links, Flash content.

| | Hypertext | Hypermedia |
|---|---|---|
| Linked content | Text only | Text, images, audio, video, animation |
| Example | A wiki page of linked articles | A website with linked videos and images |

## Linear and non-linear multimedia
- **Linear** — users start at the beginning and move through a **fixed sequence** to the end (like a film or a slideshow).
- **Non-linear** — users **choose their own path** through the content (most websites, games, e-learning modules). This gives more control and keeps users engaged.

## Interactive multimedia
**Interactive multimedia** lets the user **respond to and control** any or all of the media elements. Users become **active participants** instead of passive receivers — clicking, choosing, answering, exploring.
`,
          questions: [
            mcq(
              'Who coined the term **hypertext**, around 1965?',
              ['Tim Berners-Lee', 'Ted Nelson', 'Bill Gates', 'Vint Cerf'],
              1,
              'Ted Nelson coined "hypertext" around 1965.',
              'easy',
            ),
            mcq(
              'What is the best-known example of a **hypermedia** application?',
              ['A printed book', 'The World Wide Web', 'A radio broadcast', 'A calculator'],
              1,
              'The web links text, images, audio and video.',
              'easy',
            ),
            tf(
              'Hypermedia, unlike hypertext, can link to images, sound and video.',
              true,
              'Hypermedia extends links to other media.',
              'easy',
            ),
            match(
              'Match each kind of multimedia with its navigation.',
              [
                ['Linear', 'Fixed sequence from start to end'],
                ['Non-linear', 'User chooses their own path'],
                ['Interactive', 'User responds to and controls the media'],
              ],
              'Navigation style decides how much control the user has.',
            ),
            blank(
              'Moving through hypertext by following links in any order is called [[b1]] navigation.',
              { b1: ['non-linear', 'nonlinear', 'non linear'] },
              'Hypertext navigation is usually non-linear.',
            ),
          ],
        },
      ],
      revision: `
- **Multimedia** = more than one media element; web multimedia is **interactive**.
- Five elements: **text, graphics, animation, sound, video**; combined by **digitising**.
- Applications: WWW, authoring, courseware, video, interactive TV, games, VR, multimedia databases.
- **Hypertext** (Ted Nelson, ~1965): linked text, non-linear. **Hypermedia**: links across all media; the **WWW**.
- **Linear** (fixed sequence) vs **non-linear** (user chooses). **Interactive**: user controls the media.
`,
    },
    {
      key: 'mm-ch2',
      numberLabel: '2',
      title: { en: 'Uses of Multimedia and Careers', ne: 'मल्टिमिडियाको प्रयोग र करियर' },
      description:
        'Why multimedia works, where it is used, the categories of web multimedia, and the jobs in it.',
      topics: [
        {
          key: 'mm-ch2-t1',
          title: { en: 'Importance and uses of multimedia', ne: 'मल्टिमिडियाको महत्त्व र प्रयोग' },
          estimatedMinutes: 20,
          note: `
## Why multimedia matters
> "Tell me and I will forget; show me and I may remember; involve me and I will understand."

Everyone learns differently. Multimedia reaches different learning styles at once. A commonly quoted rule of thumb says people remember about **20%** of what they see, **30%** of what they hear, **50%** of what they **see and hear**, and up to **80%** when they are also **involved** through interaction.

### Benefits
- Suits **multiple learning styles**
- Conveys content effectively and **reinforces one idea** with several media
- Engages **several senses**, making rich experiences
- Brings flat information **to life**
- Makes learning and browsing **more enjoyable**
- Improves **retention**
- Lets users **control** their own experience

## Where multimedia is used
| Area | Uses |
|---|---|
| **Business** | Presentations, training, marketing, advertising, product demos, catalogues, video conferencing |
| **Schools** | Interactive lessons, self-paced learning, distance and open learning |
| **Home** | Hobbies (cooking, gardening, repairs), photo and video collections, interactive TV |
| **Public places** | Information **kiosks** at airports, stations, hotels, malls and museums; self-service transactions |
| **Internet** | The web itself, online multiplayer games, e-learning |
| **Mobile devices** | Phones and tablets; **MMS** (multimedia messaging) sends pictures, video, sound and text over wireless networks |

## Categories of web-based multimedia
1. **E-commerce** — selling products and services online, with rich advertising and marketing.
2. **Web-based training and distance learning** — instruction delivered over the internet in a browser.
3. **Research and reference** — online newspapers, magazines, books and encyclopaedias, with cross-references and powerful search.
4. **Entertainment and games** — some of the most popular and varied interactive sites.
`,
          questions: [
            num(
              'According to the rule of thumb in this chapter, what percentage of what they see AND hear do people remember?',
              50,
              'About 20% seen, 30% heard, 50% seen and heard, 80% with interaction.',
              'easy',
            ),
            num(
              'And what percentage do people remember when they are also involved through interaction?',
              80,
              'Interaction raises retention to about 80%.',
              'easy',
            ),
            mcq(
              'An airport information **kiosk** is an example of multimedia in…',
              ['schools', 'public places', 'the home', 'mobile devices'],
              1,
              'Kiosks in airports, malls and museums are public-place multimedia.',
              'easy',
            ),
            mcq(
              'What does **MMS** let a mobile phone send?',
              [
                'Only plain text',
                'Pictures, video, sound and text messages',
                'Phone calls only',
                'Electricity',
              ],
              1,
              'MMS = multimedia messaging service.',
              'easy',
            ),
            multi(
              'Which are categories of web-based multimedia?',
              [
                'E-commerce',
                'Web-based training and distance learning',
                'Research and reference',
                'Entertainment and games',
              ],
              [0, 1, 2, 3],
              'All four are categories of web-based multimedia.',
            ),
            tf(
              'Multimedia helps because it reinforces one idea with several media and suits different learning styles.',
              true,
              'That is the main reason multimedia improves learning.',
              'easy',
            ),
          ],
        },
        {
          key: 'mm-ch2-t2',
          title: { en: 'Careers in web-based multimedia', ne: 'वेब मल्टिमिडियामा करियर' },
          estimatedMinutes: 15,
          note: `
## The team behind a multimedia project
Multimedia projects bring together people with very different skills.

### Management
| Role | Responsibility |
|---|---|
| **Executive producer** | Moves a project into and through production |
| **Project manager** | Forms the project, moves it into production and oversees its creation |

### Production
| Role | Responsibility |
|---|---|
| **Audio specialist** | Music, sound effects, voice-overs; recording and editing audio |
| **Computer programmer** | Writes the code that makes the site interactive and responsive |
| **Video specialist** | Captures and edits original video |
| **Web designer** | Designs a cohesive, well-planned site from the front end |
| **Web developer** | Makes the front end and back end work together |
| **Webmaster** | Keeps the site technically correct and working on the web server |

### Art
| Role | Responsibility |
|---|---|
| **Animation specialist** | Creates 2-D and 3-D animation from sequences of images |
| **Art director** | Coordinates all the artwork for the project |
| **Graphic artist / designer** | Creates and designs the graphic images |
| **Interface designer** | The look of the interface and the navigation |
| **Photographer / videographer** | Shoots high-quality photos and video |

### Content
| Role | Responsibility |
|---|---|
| **Content specialist** | Makes sure information is accurate and authentic |
| **Instructional designer** | Designs effective learning experiences |
| **Writers and editors** | Technical writers, scriptwriters, creative writers, journalists |

### Support
| Role | Responsibility |
|---|---|
| **Production assistant** | Entry-level production work |
| **Quality assurance** | Tests the site on many platforms and browsers |
| **Sales and marketing** | Gives input and feedback; promotes the product |
| **Customer support** | Answers users' questions and problems |
`,
          questions: [
            match(
              'Match each multimedia role with its main responsibility.',
              [
                ['Interface designer', 'The look of the interface and navigation'],
                ['Web developer', 'Connecting the front end with the back end'],
                ['Quality assurance', 'Testing on many platforms and browsers'],
                ['Content specialist', 'Accuracy and authenticity of information'],
              ],
              'Each role covers a different part of a project.',
            ),
            mcq(
              'Who keeps a website technically correct and working on the web server?',
              ['Art director', 'Webmaster', 'Photographer', 'Executive producer'],
              1,
              'The webmaster looks after the live site and server.',
              'easy',
            ),
            mcq(
              'Which role belongs to the **art** group of multimedia careers?',
              ['Project manager', 'Animation specialist', 'Customer support', 'Computer programmer'],
              1,
              'Animation specialists, art directors, graphic and interface designers and photographers are art roles.',
            ),
            tf(
              'A project manager forms a project, moves it into production and oversees its creation.',
              true,
              "That is the project manager's role.",
              'easy',
            ),
            subj(
              'Name the five groups of careers in web-based multimedia and give one role from each.',
              `1. **Management** — project manager (or executive producer)
2. **Production** — web developer (or programmer, audio or video specialist, web designer, webmaster)
3. **Art** — graphic designer (or animation specialist, art director, interface designer, photographer)
4. **Content** — content specialist (or instructional designer, writer/editor)
5. **Support** — quality assurance (or sales and marketing, customer support)`,
            ),
          ],
        },
      ],
      revision: `
- "Tell me… show me… **involve me** and I will understand." Retention: 20% see, 30% hear, 50% both, 80% with interaction.
- Benefits: multiple learning styles, reinforcement, several senses, enjoyment, retention, user control.
- Used in business, school, home, public places (kiosks), the internet and mobile (MMS).
- Web categories: **e-commerce, training/distance learning, research/reference, entertainment/games**.
- Careers: **management, production, art, content, support**.
`,
    },
  ],
};
