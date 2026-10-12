import { blank, match, mcq, multi, num, subj, tf } from '../questions.ts';
import type { PackCourse } from '../types.ts';

/** Introductory Biology for Engineers, Unit 1: Biomolecules (B.Tech, Semester 1): original notes and questions (D-071). */
export const biology: PackCourse = {
  key: 'bio',
  slug: 'introductory-biology',
  title: { en: 'Introductory Biology for Engineers', ne: 'इन्जिनियरहरूका लागि परिचयात्मक जीवविज्ञान' },
  shortDescription: {
    en: 'Why engineers study biology, the origin and classification of life, and the four families of biomolecules.',
    ne: 'इन्जिनियरले किन जीवविज्ञान पढ्छन्, जीवनको उत्पत्ति र वर्गीकरण, र चार प्रकारका जैविक अणु।',
  },
  description: `
## What you will learn
Unit 1 of a first-year "Biology for Engineers" paper — **Biomolecules** — explained simply for students without a biology background:

- Why biology matters to engineers, how life began, and how living things are classified
- The elements life is built from, and how small molecules join into large ones
- **Carbohydrates** — sugars, starch, glycogen, cellulose
- **Lipids** — fatty acids, fats, phospholipids, cholesterol and lipoproteins
- **Proteins** — amino acids and the four levels of protein structure
- **Nucleic acids** — nucleotides and the DNA double helix

Every chapter has a **PDF handout**, a **quiz**, and a timed **subject test** at the end.

> The first chapter is free.
`,
  semester: 'semester-1',
  isFeatured: false,
  popularityRank: 4,
  subject: {
    key: 'bio-subject',
    name: { en: 'Biomolecules', ne: 'जैविक अणु' },
    summary: {
      en: 'Origin and classification of life; elements; carbohydrates, lipids, proteins and nucleic acids.',
      ne: 'जीवनको उत्पत्ति र वर्गीकरण; तत्व; कार्बोहाइड्रेट, लिपिड, प्रोटिन र न्युक्लिक एसिड।',
    },
  },
  chapters: [
    {
      key: 'bio-ch1',
      numberLabel: '1',
      title: {
        en: 'Life: Why Study It, Origin and Classification',
        ne: 'जीवन: किन पढ्ने, उत्पत्ति र वर्गीकरण',
      },
      description: 'Why biology matters, how life may have begun, and how organisms are classified.',
      topics: [
        {
          key: 'bio-ch1-t1',
          title: { en: 'Why study biology?', ne: 'जीवविज्ञान किन पढ्ने?' },
          estimatedMinutes: 15,
          note: `
## Life as information
Living things store and process information much like computers:

- **DNA** uses an alphabet of just **4 nucleotides** (A, T, G, C);
- **mRNA** copies a gene using 4 nucleotides (with U instead of T);
- **Proteins** are written in an alphabet of **20 amino acids**.

The human genome has about **3 billion base pairs** per set of chromosomes (about 6 billion in a body cell) and roughly **20,000 protein-coding genes**. Because one gene can be read in several ways (**alternative splicing**) and proteins are modified after they are made, a human makes far more different proteins than it has genes. Printed out, one human genome would fill around a million pages.

All of your cells carry the **same genome**, yet a nerve cell and a muscle cell are very different — they make different sets of proteins (different **proteomes**). In the same way a caterpillar and the butterfly it becomes share one genome.

## Why biology matters — especially to engineers
1. It answers basic questions about **life, organisms, infection and disease**.
2. It explains how organisms **depend on each other** and their environment (food webs).
3. It explains changes in the **human body**, infections and diseases.
4. It drives **scientific investigation** and large-scale solutions (vaccines, clean water, food security).
5. It shapes **careers** — medicine, agriculture, biotechnology, bioinformatics, biomedical devices, and engineering inspired by nature (biomimicry).

> **For engineers:** biosensors, prosthetics, drug-delivery devices, genome analysis software and bio-inspired design all need biology.
`,
          questions: [
            num('How many different nucleotides make up the "alphabet" of DNA?', 4, 'A, T, G and C.', 'easy'),
            num(
              'How many standard amino acids make up proteins?',
              20,
              'Proteins are built from 20 standard amino acids.',
              'easy',
            ),
            mcq(
              'Why can one gene give rise to several different proteins?',
              [
                'Mutation in every cell',
                'Alternative splicing and modification after translation',
                'Cells have several genomes',
                'Proteins copy themselves',
              ],
              1,
              'Splicing the same gene in different ways, and modifying proteins after they are made, multiplies protein variety.',
            ),
            tf(
              'A nerve cell and a muscle cell of the same person contain different genomes.',
              false,
              'They share the same genome but express different proteins (different proteomes).',
              'easy',
            ),
          ],
        },
        {
          key: 'bio-ch1-t2',
          title: { en: 'The origin of life', ne: 'जीवनको उत्पत्ति' },
          estimatedMinutes: 15,
          note: `
## The early Earth
Earth formed about **4.5 billion years ago**. Life is estimated to have appeared about **3.8 billion years ago** — roughly 750 million years later. Scientists assume the early atmosphere was:

- **reducing** — little or **no free oxygen**;
- made mostly of **CO~2~ and N~2~**, with small amounts of **H~2~, CH~4~ (methane) and NH~3~ (ammonia)**;
- with **liquid water** present.

## The Miller–Urey experiment (1953)
Stanley Miller and Harold Urey tested whether the building blocks of life could form on their own:

1. They sealed **methane, ammonia, hydrogen and water vapour** in glass flasks, imitating the early atmosphere and ocean.
2. They passed **electric sparks** through the gases, imitating lightning.
3. After about a week the water contained **organic molecules**.

| Formed | Examples |
|---|---|
| Amino acids | Glycine, alanine, aspartic acid, glutamic acid |
| Other organic molecules | Urea, lactic acid, formic acid, acetic acid |

**Conclusion:** simple organic **biomolecules can form spontaneously** from inorganic gases under early-Earth conditions. Over time these small molecules could join (**polymerise**) into larger ones, a step on the road to the first cells.
`,
          questions: [
            mcq(
              'In the Miller–Urey experiment, electric sparks were used to imitate…',
              ['sunlight', 'lightning', 'volcanic heat', 'radioactivity'],
              1,
              'Sparks imitated lightning in the early atmosphere.',
              'easy',
            ),
            multi(
              'Which amino acids were formed in the Miller–Urey experiment?',
              ['Glycine', 'Alanine', 'Glutamic acid', 'Haemoglobin'],
              [0, 1, 2],
              'Haemoglobin is a large protein, not an amino acid.',
            ),
            tf(
              "The early Earth's atmosphere is thought to have been rich in free oxygen.",
              false,
              'It was reducing, with little or no free oxygen.',
              'easy',
            ),
            num(
              'About how many billion years ago is life estimated to have originated on Earth? (one decimal place)',
              3.8,
              'About 3.8 billion years ago.',
              'easy',
              0.1,
            ),
          ],
        },
        {
          key: 'bio-ch1-t3',
          title: { en: 'Classifying life and the tree of life', ne: 'जीवनको वर्गीकरण र जीवन-वृक्ष' },
          estimatedMinutes: 20,
          note: `
## Levels of organisation
**Elements → biomolecules → cell → tissue → organ → organism.** The **cell** is the basic unit of life.

## Taxonomic ranks
From the broadest to the narrowest:

**Domain → Kingdom → Phylum → Class → Order → Family → Genus → Species**

> Memory hook: "**D**ear **K**ing **P**hilip **C**ame **O**ver **F**or **G**ood **S**oup."

### Humans (Homo sapiens)
| Rank | Human |
|---|---|
| Domain | Eukarya |
| Kingdom | Animalia |
| Phylum | Chordata |
| Class | Mammalia |
| Order | Primates |
| Family | Hominidae |
| Genus | *Homo* |
| Species | *Homo sapiens* |

## Phylogenetic trees
A **phylogenetic tree** shows the **evolutionary relationships** among species, based on similarities and differences in genetic or physical traits.

- **Branches** are lineages; **nodes** (branch points) are **common ancestors** where one lineage split into two.
- **Sister taxa** share an immediate common ancestor.
- Example: humans and bony fish share a more recent common ancestor with each other than either does with sharks.

### The three domains
In **1977, Carl Woese** compared **16S ribosomal RNA** sequences and proposed three domains of life: **Bacteria, Archaea and Eukarya**. In 2012 Stefan Luketa proposed adding two acellular domains — **Prionobiota** (no nucleic acid) and **Virusobiota** (with nucleic acid) — though this five-domain idea is not widely adopted.
`,
          questions: [
            mcq(
              'Which is the correct order of taxonomic ranks, from broadest to narrowest?',
              [
                'Kingdom, Domain, Class, Phylum, Order, Family, Species, Genus',
                'Domain, Kingdom, Phylum, Class, Order, Family, Genus, Species',
                'Domain, Phylum, Kingdom, Order, Class, Genus, Family, Species',
                'Species, Genus, Family, Order, Class, Phylum, Kingdom, Domain',
              ],
              1,
              'Domain → Kingdom → Phylum → Class → Order → Family → Genus → Species.',
              'easy',
            ),
            mcq(
              'Carl Woese defined the three domains of life by comparing…',
              ['bone structure', '16S ribosomal RNA sequences', 'cell walls', 'blood groups'],
              1,
              'He compared 16S rRNA sequences in 1977.',
            ),
            blank(
              'Humans belong to the order [[b1]] and the family Hominidae.',
              { b1: ['Primates', 'primate'] },
              'Order Primates, family Hominidae.',
              'easy',
            ),
            tf(
              'In a phylogenetic tree, an internal node represents a common ancestor.',
              true,
              'Nodes are branch points where lineages split from a common ancestor.',
            ),
            multi(
              'Which are the three domains of life proposed by Woese?',
              ['Bacteria', 'Archaea', 'Eukarya', 'Animalia'],
              [0, 1, 2],
              'Animalia is a kingdom within Eukarya.',
              'easy',
            ),
          ],
        },
      ],
      revision: `
- Genome alphabet: **4 nucleotides**; protein alphabet: **20 amino acids**; same genome, different proteomes.
- Life began about **3.8 billion years ago** in a reducing, oxygen-poor atmosphere.
- **Miller–Urey (1953):** CH~4~, NH~3~, H~2~, H~2~O + sparks → amino acids (glycine, alanine…) and other organics.
- Ranks: **Domain, Kingdom, Phylum, Class, Order, Family, Genus, Species**.
- **Woese (1977):** three domains — Bacteria, Archaea, Eukarya — from 16S rRNA.
- Phylogenetic tree: branches = lineages, nodes = common ancestors.
`,
    },
    {
      key: 'bio-ch2',
      numberLabel: '2',
      title: { en: 'Elements and Biomolecules', ne: 'तत्व र जैविक अणु' },
      description: 'The elements of life and the four families of biomolecules, as monomers and polymers.',
      topics: [
        {
          key: 'bio-ch2-t1',
          title: { en: 'The elements of life', ne: 'जीवनका तत्व' },
          estimatedMinutes: 15,
          note: `
## Which elements does life need?
At least **25 elements** are essential for life. Four of them — **carbon, hydrogen, oxygen and nitrogen** — make up about 96% of the mass of a living body.

| Group | Count | Elements |
|---|---|---|
| **Bulk elements** | 11 | H, C, N, O, P, S, Na, Cl, Mg, K, Ca |
| **Trace elements** | 14 | B, F, Si, V, Cr, Mn, Fe, Co, Ni, Cu, Zn, Se, Mo, I |
| Possibly essential for some species | — | As, Br, Sr, Cd, Sn, Ba, W |

- Organisms take these elements from their **environment**, and they return through **biogeochemical cycles** (carbon cycle, nitrogen cycle…).
- The same elements and biomolecules in all organisms point to a **common origin** of life, although the exact composition varies between species and individuals.

## Organic vs inorganic
| Organic compounds | Inorganic compounds |
|---|---|
| Contain **carbon** (bonded to hydrogen) | Generally do not contain carbon–hydrogen bonds |
| Typical of living things | Typical of non-living matter |
| Examples: glucose, proteins, fats | Examples: water, salt (NaCl), CO~2~ |

## Why carbon?
Carbon forms **four covalent bonds**, and can bond to other carbons in long chains, branches and rings — giving the enormous variety of biomolecules. Biomolecules carry **functional groups** such as hydroxyl (–OH), carboxyl (–COOH), amino (–NH~2~) and phosphate.
`,
          questions: [
            num(
              'At least how many elements are essential for life?',
              25,
              '11 bulk elements and 14 trace elements.',
              'easy',
            ),
            multi(
              'Which of these are **bulk** elements?',
              ['Carbon', 'Nitrogen', 'Calcium', 'Iodine', 'Molybdenum'],
              [0, 1, 2],
              'Iodine and molybdenum are trace elements.',
            ),
            mcq(
              'Which element is a **trace** element?',
              ['Sodium', 'Phosphorus', 'Iron', 'Oxygen'],
              2,
              'Iron is needed only in small amounts (it is in haemoglobin).',
              'easy',
            ),
            tf(
              'Carbon is central to biomolecules because it can form four covalent bonds, including chains and rings.',
              true,
              'This bonding versatility gives the huge variety of organic molecules.',
              'easy',
            ),
          ],
        },
        {
          key: 'bio-ch2-t2',
          title: { en: 'The four families of biomolecules', ne: 'जैविक अणुका चार परिवार' },
          estimatedMinutes: 15,
          note: `
## What biomolecules do
Biomolecules are the carbon-containing components of living matter. They serve as a **source of energy**, **energy storage**, the **machinery of metabolism**, and the **building blocks** of cells. The large ones are joined by **covalent bonds**.

## The four families
| Family | Examples | Elements |
|---|---|---|
| **Carbohydrates** | Sugars and starches | C, H, O |
| **Lipids** | Fats and oils | C, H, O (some also P, N) |
| **Proteins** | Built from amino acids | C, H, O, N (often S) |
| **Nucleic acids** | DNA and RNA, built from nucleotides | C, H, O, N, P |

## Monomers and polymers
Large biomolecules (**polymers**, or macromolecules) are built from small repeating units (**monomers**):

| Monomer | Polymer |
|---|---|
| Glucose (a monosaccharide) | Starch, glycogen, cellulose |
| Amino acids | Proteins (polypeptides) |
| Nucleotides | Nucleic acids (DNA, RNA) |
| Fatty acids + glycerol | Triglycerides (fats) — not a true repeating polymer |

- Monomers join by **condensation (dehydration)** reactions, which **release water**.
- Polymers are broken down by **hydrolysis**, which **uses water**.

Vitamins and minerals are also needed, in small amounts.
`,
          questions: [
            match(
              'Match each polymer with its monomer.',
              [
                ['Protein', 'Amino acid'],
                ['DNA', 'Nucleotide'],
                ['Starch', 'Glucose'],
              ],
              'Each macromolecule is built from its own kind of monomer.',
              'easy',
              ['Fatty acid only'],
            ),
            mcq(
              'Which biomolecule family always contains **phosphorus**?',
              ['Carbohydrates', 'Nucleic acids', 'Simple fats', 'Monosaccharides'],
              1,
              'Nucleotides contain a phosphate group, so nucleic acids contain P.',
            ),
            mcq(
              'Monomers join to form polymers by which kind of reaction?',
              ['Hydrolysis', 'Condensation (dehydration)', 'Oxidation', 'Combustion'],
              1,
              'Condensation releases a water molecule for each bond formed.',
            ),
            tf(
              'Hydrolysis breaks polymers into monomers using water.',
              true,
              'Hydrolysis is the reverse of condensation.',
              'easy',
            ),
          ],
        },
      ],
      revision: `
- **25+ essential elements**: 11 bulk (H, C, N, O, P, S, Na, Cl, Mg, K, Ca) and 14 trace (B, F, Si, V, Cr, Mn, Fe, Co, Ni, Cu, Zn, Se, Mo, I).
- C, H, O, N ≈ 96% of body mass. Organic = carbon compounds.
- Four families: **carbohydrates, lipids, proteins, nucleic acids**.
- Monomer → polymer: glucose → starch/glycogen/cellulose; amino acid → protein; nucleotide → DNA/RNA.
- **Condensation** builds polymers (releases water); **hydrolysis** breaks them (uses water).
`,
    },
    {
      key: 'bio-ch3',
      numberLabel: '3',
      title: { en: 'Carbohydrates', ne: 'कार्बोहाइड्रेट' },
      description:
        'Monosaccharides and their stereochemistry, disaccharides, and storage and structural polysaccharides.',
      topics: [
        {
          key: 'bio-ch3-t1',
          title: { en: 'Carbohydrates and monosaccharides', ne: 'कार्बोहाइड्रेट र मोनोस्याकराइड' },
          estimatedMinutes: 25,
          note: `
## What carbohydrates are
The name comes from the French *hydrate de carbone*, "hydrate of carbon". Carbohydrates are **polyhydroxy aldehydes or ketones**, their derivatives, or substances that yield them on hydrolysis. General formula **C~n~(H~2~O)~n~**.

Plants make them by **photosynthesis**: 6 CO~2~ + 6 H~2~O → C~6~H~12~O~6~ (glucose) + 6 O~2~, using light energy.

### Uses
1. **Energy** — glucose is broken down to release energy. (Hospitals give D-glucose drips because cells can use it directly.)
2. **Energy storage** — glucose joined into **starch** (plants) and **glycogen** (animals).
3. **Structure** — **cellulose** in plant cell walls (wood, paper, cotton); ribose and deoxyribose in the backbone of **RNA and DNA**.
4. **Other sugars** — lactose (milk sugar), sucrose (table sugar).
5. **Carbon source** for making proteins, lipids and nucleic acids.

## Classification
| Class | Units | Examples |
|---|---|---|
| Monosaccharides | 1 | Glucose, fructose, ribose |
| Oligosaccharides — disaccharides | 2 | Sucrose, maltose, lactose |
| Oligosaccharides — trisaccharides | 3 | Raffinose |
| Polysaccharides | Many (10 or more) | Starch, glycogen (storage); cellulose, chitin (structural) |

| Monosaccharides | Polysaccharides |
|---|---|
| Simple sugars, low molecular weight | Complex, high molecular weight |
| Soluble in water | Insoluble |
| Sweet | Tasteless |
| Colourless crystals | Non-crystalline |

## Monosaccharides
**Simple sugars** that cannot be hydrolysed into smaller sugars; formula **(CH~2~O)~n~**. They are named by the **number of carbons** and by their **carbonyl group**:

- **Aldoses** have an aldehyde group (–CHO); **ketoses** have a ketone group (C=O).

| Carbons | Name | Aldose | Ketose |
|---|---|---|---|
| 3 | Triose | Glyceraldehyde | Dihydroxyacetone |
| 4 | Tetrose | Erythrose | Erythrulose |
| 5 | Pentose | Ribose, deoxyribose | Ribulose |
| 6 | Hexose | **Glucose**, galactose | **Fructose** |
| 7 | Heptose | — | Sedoheptulose |

Glucose is an **aldohexose**; fructose is a **ketohexose**.

## Stereochemistry
- A **Fischer projection** draws a sugar as a vertical chain: **horizontal bonds point towards** the viewer, **vertical bonds point away**.
- **D and L forms:** look at the chiral carbon **farthest from the carbonyl group**. If its –OH points **right**, the sugar is **D**; if **left**, it is **L**. Natural sugars are almost all **D** (L-glucose is not found in nature).
- **Enantiomers** are mirror images that cannot be superimposed (D- and L-glyceraldehyde).
- **Diastereomers** are stereoisomers with two or more chiral centres that are **not** mirror images.
`,
          questions: [
            mcq(
              'Glucose is best described as an…',
              ['aldopentose', 'aldohexose', 'ketohexose', 'aldotriose'],
              1,
              'Glucose has 6 carbons and an aldehyde group.',
              'easy',
            ),
            mcq(
              'Fructose is a…',
              ['ketohexose', 'aldohexose', 'ketopentose', 'disaccharide'],
              0,
              'Fructose has 6 carbons and a ketone group.',
              'easy',
            ),
            match(
              'Match each sugar with its class.',
              [
                ['Glyceraldehyde', 'Triose'],
                ['Ribose', 'Pentose'],
                ['Sucrose', 'Disaccharide'],
                ['Starch', 'Polysaccharide'],
              ],
              'Classes depend on the number of carbons or sugar units.',
            ),
            tf(
              'In a Fischer projection, horizontal bonds point towards the viewer.',
              true,
              'Horizontal = towards the viewer; vertical = away.',
            ),
            blank(
              'A sugar is the D form when the –OH on the chiral carbon farthest from the carbonyl points to the [[b1]].',
              { b1: ['right'] },
              'Right = D; left = L.',
            ),
            multi(
              'Which are properties of **monosaccharides**?',
              ['Sweet taste', 'Soluble in water', 'High molecular weight', 'Crystalline'],
              [0, 1, 3],
              'High molecular weight is a property of polysaccharides.',
            ),
          ],
        },
        {
          key: 'bio-ch3-t2',
          title: { en: 'Disaccharides', ne: 'डाइस्याकराइड' },
          estimatedMinutes: 15,
          note: `
## How sugars join
Two monosaccharides join by a **glycosidic bond**, formed by condensation (a water molecule is released). The bond is named by the carbons it links and the α/β form of the first sugar, e.g. **α(1→4)**.

## The three important disaccharides
| Disaccharide | Made of | Bond | Source | Digested by | Reducing? |
|---|---|---|---|---|---|
| **Maltose** (malt sugar) | Glucose + glucose | α(1→4) | Germinating grains; starch breakdown | Maltase | Yes |
| **Lactose** (milk sugar) | Galactose + glucose | β(1→4) | Milk | Lactase | Yes |
| **Sucrose** (table sugar) | Glucose + fructose | α1→β2 | Sugar cane, sugar beet | Sucrase | **No** |

### Points to remember
- A **reducing sugar** has a free aldehyde or ketone group that can reduce reagents such as Benedict's solution. In **sucrose** both anomeric carbons are tied up in the bond, so it is **non-reducing**.
- **Lactose intolerance** happens when the body makes too little **lactase**, so lactose is not digested.
- Sucrose melts and turns into **caramel** at about 186 °C.
`,
          questions: [
            mcq(
              'Which disaccharide is **non-reducing**?',
              ['Maltose', 'Lactose', 'Sucrose', 'All are reducing'],
              2,
              'In sucrose both anomeric carbons are in the glycosidic bond.',
            ),
            match(
              'Match each disaccharide with its component sugars.',
              [
                ['Maltose', 'Glucose + glucose'],
                ['Lactose', 'Galactose + glucose'],
                ['Sucrose', 'Glucose + fructose'],
              ],
              'Know the building blocks of each disaccharide.',
              'easy',
              ['Fructose + fructose'],
            ),
            mcq(
              'Lactose intolerance is caused by a shortage of which enzyme?',
              ['Sucrase', 'Maltase', 'Lactase', 'Amylase'],
              2,
              'Lactase digests lactose.',
              'easy',
            ),
            blank(
              'The bond that joins two monosaccharides is called a [[b1]] bond.',
              { b1: ['glycosidic'] },
              'Glycosidic bonds link sugar units.',
              'easy',
            ),
          ],
        },
        {
          key: 'bio-ch3-t3',
          title: { en: 'Polysaccharides', ne: 'पोलिस्याकराइड' },
          estimatedMinutes: 25,
          note: `
## What polysaccharides are
Large molecules of **10 or more** monosaccharide units, in a straight or **branched** chain. Two main roles: **energy storage** and **structural support**.

### By function
| Storage (digestible) | Structural (indigestible) |
|---|---|
| Starch (plants), glycogen (animals), inulin | Cellulose, pectin, chitin; hyaluronic acid, chondroitin |

Storage and structural polysaccharides can both be made of glucose — they differ in the **type of glycosidic bond** and the **branching**.

### By composition
- **Homopolysaccharides** — one kind of monosaccharide: starch, glycogen and cellulose (glucose); inulin (fructose); agar (galactose).
- **Heteropolysaccharides** — more than one kind; when they include amino sugars or uronic acids they are called **mucopolysaccharides**. They are gel-like, very large (up to about 5 × 10^6^ daltons), and act as **lubricants and cementing substances** in connective tissue and mucus.

## Starch and glycogen (storage)
- **Starch** = amylose (unbranched, α(1→4)) + amylopectin (branched with α(1→6) links).
- **Glycogen** is "animal starch", stored in liver and muscle; it is **more highly branched** than amylopectin, so it can be broken down quickly.

## Cellulose (structural)
- A straight polymer of glucose joined by **β(1→4)** bonds; molecular weight 200,000–2,000,000 Da, i.e. about **1,250–12,500 glucose units**.
- Chains lie side by side, held by **hydrogen bonds**, forming strong **microfibrils** that give plant cell walls their strength.
- **Humans cannot digest cellulose** (we lack the enzyme **cellulase**), but it is valuable **dietary fibre**. Ruminants (cattle, goats, sheep, camels) and termites digest it with the help of microbes.
- **Uses:** wood, cotton, paper; **mercerised cotton** (alkali-treated, silky); **rayon** (dissolved and regenerated cellulose); **cellulose nitrate** (explosives, lacquers, celluloid); **cellulose acetate** (photographic film, packaging).

## Chitin
The exoskeleton of insects and crustaceans and the cell walls of fungi. A polymer of **N-acetylglucosamine** with **β(1→4)** bonds — rigid and strong. Used for **surgical threads** and waterproofing.

## Agar and agarose
Extracted from **marine red algae**: agarose gives **gel strength**, agaropectin gives viscosity. Used for **microbial culture media**, as an emulsifier, a bulk laxative, and in jellies.
`,
          questions: [
            mcq(
              'What type of glycosidic bond links the glucose units of **cellulose**?',
              ['α(1→4)', 'β(1→4)', 'α(1→6)', 'α1→β2'],
              1,
              'Cellulose uses β(1→4) bonds, which humans cannot digest.',
            ),
            tf(
              'Humans can digest cellulose because they produce cellulase.',
              false,
              'Humans lack cellulase; cellulose acts as dietary fibre.',
              'easy',
            ),
            match(
              'Match each polysaccharide with where it is found.',
              [
                ['Glycogen', 'Liver and muscle of animals'],
                ['Cellulose', 'Plant cell walls'],
                ['Chitin', 'Insect exoskeletons and fungal cell walls'],
              ],
              'Storage vs structural roles.',
            ),
            multi(
              'Which are **homopolysaccharides**?',
              ['Starch', 'Glycogen', 'Cellulose', 'Hyaluronic acid'],
              [0, 1, 2],
              'Hyaluronic acid is a heteropolysaccharide (mucopolysaccharide).',
            ),
            mcq(
              'Chitin, found in insect exoskeletons and fungal cell walls, is a polymer of…',
              [
                'glucose with α(1→4) bonds',
                'N-acetylglucosamine with β(1→4) bonds',
                'fructose',
                'galactose with α(1→6) bonds',
              ],
              1,
              'Chitin is built from N-acetylglucosamine units joined by β(1→4) bonds.',
            ),
            subj(
              'Starch and cellulose are both polymers of glucose. Why are their properties and uses so different?',
              `They differ in the **glycosidic bond** and **shape**:

- **Starch** uses **α(1→4)** bonds (with **α(1→6)** branches in amylopectin); the chains coil, are easy to hydrolyse, and serve as **energy storage** that we can digest.
- **Cellulose** uses **β(1→4)** bonds; the chains are straight and pack side by side with hydrogen bonds into strong **microfibrils** — a **structural** material that humans cannot digest (no cellulase) and that gives wood, cotton and paper their strength.`,
              'hard',
            ),
          ],
        },
      ],
      revision: `
- Carbohydrates: **C~n~(H~2~O)~n~**, polyhydroxy aldehydes/ketones; made by photosynthesis.
- **Aldoses** (–CHO) vs **ketoses** (C=O). Glucose = aldohexose; fructose = ketohexose.
- Fischer projection; **D** if the last chiral –OH points right; natural sugars are D.
- Disaccharides: **maltose** (glc+glc, α1→4), **lactose** (gal+glc, β1→4), **sucrose** (glc+fru, α1→β2, **non-reducing**).
- Storage: **starch** (amylose + amylopectin), **glycogen** (highly branched). Structural: **cellulose** (β1→4, indigestible to humans), **chitin** (N-acetylglucosamine).
- Agar/agarose from red algae → culture media.
`,
    },
    {
      key: 'bio-ch4',
      numberLabel: '4',
      title: { en: 'Lipids', ne: 'लिपिड' },
      description:
        'Functions of lipids, fatty acids and their naming, the classification of lipids, and lipoproteins.',
      topics: [
        {
          key: 'bio-ch4-t1',
          title: { en: 'Lipids and fatty acids', ne: 'लिपिड र फ्याटी एसिड' },
          estimatedMinutes: 25,
          note: `
## What lipids are
**Lipids** (Greek *lipos*, fat) are fatty acids and their derivatives. They are **insoluble in water** but **soluble in organic solvents** such as ether, chloroform, benzene and acetone. They include fats, oils, waxes and steroids — some **visible** (butter, oil) and some **invisible** (in meat, nuts, milk).

## Functions
1. **Energy source** — **1 g of fat gives about 9 kcal** (more than twice carbohydrates or protein, about 4 kcal/g).
2. **Energy storage** — the body's largest energy store, as fat in adipose tissue.
3. **Cell membranes** — phospholipids form the membrane around every cell.
4. **Hormones, signals and vitamins** — steroid hormones; absorption of the **fat-soluble vitamins A, D, E and K**.
5. **Protection** — padding around internal organs.
6. **Insulation** — heat insulation under the skin, and **electrical insulation** of nerve fibres (myelin).
7. **Food quality** — flavour and texture.

## Fatty acids
A **fatty acid** is a long **hydrocarbon chain** (4 to 36 carbons) with a **carboxyl group (–COOH)** at one end. The chain may be:

- **saturated** — no carbon–carbon double bonds (straight chains; solid at room temperature);
- **unsaturated** — one or more double bonds, usually in the **cis** form, which puts a kink in the chain (liquid oils).

### Naming
- Carbons are numbered from the carboxyl carbon (C-1). C-2 is the **α carbon**, C-3 **β**, C-4 **γ**…
- **16:0** = 16 carbons, no double bonds (palmitic acid).
- **18:1 (Δ9)** = 18 carbons, one double bond after C-9 (oleic acid, *cis*-9-octadecenoic acid).
- Systematic names: saturated acids end in **-anoic** (hexadecanoic); unsaturated end in **-enoic** (octadecenoic).

### Classifications
| By double bonds | By chain length |
|---|---|
| **SFA** — saturated, no double bonds | **Short chain** — up to 6 carbons |
| **MUFA** — monounsaturated, one double bond | **Medium chain** — 8–12 carbons |
| **PUFA** — polyunsaturated, more than one | **Long chain** — 14–18 carbons |
| | **Very long chain** — 20 or more |

## Essential fatty acids
Humans **cannot make** two PUFAs, so they must come from the diet:

| Fatty acid | Family | Formula | Sources |
|---|---|---|---|
| **Linoleic acid (LA)** | ω-6 (omega-6) | 18:2 | Sunflower, sesame and other seed oils, nuts |
| **α-Linolenic acid (ALA)** | ω-3 (omega-3) | 18:3 | Flaxseed, walnuts, fish oils |

Deficiency can cause dry, scaly skin, poor growth, weaker immunity, and liver and kidney problems.
`,
          questions: [
            num(
              'About how many kilocalories does 1 gram of fat provide?',
              9,
              'Fat provides about 9 kcal per gram.',
              'easy',
            ),
            mcq(
              'The notation **18:1 (Δ9)** describes a fatty acid with…',
              [
                '18 double bonds and 1 carbon',
                '18 carbons and one double bond after carbon 9',
                '9 carbons and 18 hydrogens',
                '18 carbons and 9 double bonds',
              ],
              1,
              'Number of carbons : number of double bonds (position).',
            ),
            multi(
              'Which vitamins are **fat-soluble**?',
              ['Vitamin A', 'Vitamin D', 'Vitamin C', 'Vitamin K'],
              [0, 1, 3],
              'A, D, E and K are fat-soluble; C is water-soluble.',
              'easy',
            ),
            match(
              'Match each essential fatty acid with its family.',
              [
                ['Linoleic acid', 'Omega-6'],
                ['Alpha-linolenic acid', 'Omega-3'],
              ],
              'LA is ω-6 (18:2); ALA is ω-3 (18:3).',
              'medium',
              ['Omega-9'],
            ),
            tf(
              'Unsaturated fatty acids in natural fats usually have their double bonds in the cis form.',
              true,
              'The cis form puts a kink in the chain, keeping oils liquid.',
            ),
          ],
        },
        {
          key: 'bio-ch4-t2',
          title: { en: 'Classes of lipids and lipoproteins', ne: 'लिपिडका वर्ग र लाइपोप्रोटिन' },
          estimatedMinutes: 25,
          note: `
## Classification of lipids
| Class | What it is | Examples |
|---|---|---|
| **Simple lipids** | Esters of fatty acids with alcohols | **Fats and oils** (triglycerides), **waxes** |
| **Compound lipids** | Fatty acid + alcohol + another group | **Phospholipids**, **glycolipids**, **lipoproteins** |
| **Derived lipids** | Made from the hydrolysis of the above | **Steroids** (cholesterol), terpenes, carotenoids, fat-soluble vitamins |

## Simple lipids
### Triglycerides (fats and oils)
One **glycerol** joined to **three fatty acids**. Stored in adipose tissue and muscle.

| Fat | Oil |
|---|---|
| Mostly animal origin | Mostly plant origin |
| Rich in saturated fatty acids | Rich in unsaturated fatty acids |
| **Solid** at room temperature | **Liquid** at room temperature |

**Blood triglyceride levels** (American Heart Association):

| mg per 100 ml (mg/dL) | Meaning |
|---|---|
| Below 150 | Normal — lowest risk of cardiovascular disease |
| 150–199 | Borderline high |
| 200–499 | High |
| 500 and above | Very high |

### Waxes
Esters of long-chain fatty acids with long-chain alcohols **other than glycerol**. Types include true waxes, **cholesterol esters**, and vitamin A and D esters. Used in lotions, ointments, polishes and cosmetics.

## Compound lipids
- **Phospholipids** — fatty acids + alcohol + **phosphoric acid**: glycerophospholipids such as **lecithin** and **cephalin**; sphingophospholipids such as **sphingomyelin**. They form the **lipid bilayer** of cell membranes.
- **Glycolipids** — fatty acid + **sphingosine** + **carbohydrate**: cerebrosides, gangliosides (nervous tissue).
- **Lipoproteins** — lipids combined with **proteins**, to carry fats in the blood.

## Lipoproteins
Lipids do not dissolve in blood, so they travel inside **lipoprotein** particles. The more protein, the **denser** (and smaller) the particle.

| Lipoprotein | Made in | Carries mainly | Job |
|---|---|---|---|
| **Chylomicron** | Small intestine | Dietary triglycerides, cholesterol, fat-soluble vitamins | Delivers dietary fat to cells and the liver |
| **VLDL** (very-low-density) | Liver | Triglycerides | Carries lipids from the liver to cells |
| **LDL** (low-density) — "bad cholesterol" | Forms in the blood from VLDL | Cholesterol | Delivers cholesterol to cells; excess deposits in arteries |
| **HDL** (high-density) — "good cholesterol" | Liver and intestine | Mostly protein | Collects excess cholesterol and returns it to the liver |

Density: **chylomicron < VLDL < LDL < HDL**; size is the reverse. A **lipid profile** blood test measures total cholesterol, LDL, HDL and triglycerides.
`,
          questions: [
            mcq(
              'A triglyceride is made of…',
              [
                'three glycerols and one fatty acid',
                'one glycerol and three fatty acids',
                'glycerol and phosphoric acid',
                'cholesterol and protein',
              ],
              1,
              'Tri-glyceride: glycerol esterified with three fatty acids.',
              'easy',
            ),
            mcq(
              'Which lipoprotein is called "good cholesterol" because it returns excess cholesterol to the liver?',
              ['Chylomicron', 'VLDL', 'LDL', 'HDL'],
              3,
              'HDL scavenges cholesterol and brings it back to the liver.',
              'easy',
            ),
            match(
              'Match each lipid with its class.',
              [
                ['Triglyceride', 'Simple lipid'],
                ['Lecithin', 'Compound lipid (phospholipid)'],
                ['Cholesterol', 'Derived lipid (steroid)'],
              ],
              'Simple, compound and derived lipids.',
            ),
            num(
              'Below what blood triglyceride level (mg per 100 ml) is considered normal by the American Heart Association?',
              150,
              'Below 150 mg/dL is normal.',
              'easy',
            ),
            tf(
              'Of the lipoproteins, chylomicrons have the lowest density and HDL the highest.',
              true,
              'Density rises with protein content: chylomicron < VLDL < LDL < HDL.',
            ),
          ],
        },
      ],
      revision: `
- Lipids: water-insoluble, soluble in organic solvents; **9 kcal/g**; energy store, membranes, hormones, vitamins A D E K, insulation.
- Fatty acid = hydrocarbon chain + –COOH. **Saturated** (no C=C) vs **unsaturated** (cis double bonds). 16:0, 18:1(Δ9).
- SFA / MUFA / PUFA; short (≤6), medium (8–12), long (14–18), very long (≥20).
- Essential: **linoleic (ω-6, 18:2)** and **α-linolenic (ω-3, 18:3)**.
- **Simple** (triglycerides, waxes), **compound** (phospholipids, glycolipids, lipoproteins), **derived** (steroids).
- Lipoproteins: chylomicron, VLDL, **LDL ("bad")**, **HDL ("good")**; density increases in that order.
`,
    },
    {
      key: 'bio-ch5',
      numberLabel: '5',
      title: { en: 'Proteins', ne: 'प्रोटिन' },
      description:
        'Amino acids and their classes, the peptide bond, and the four levels of protein structure.',
      topics: [
        {
          key: 'bio-ch5-t1',
          title: { en: 'Amino acids', ne: 'एमिनो एसिड' },
          estimatedMinutes: 25,
          note: `
## Proteins
**Proteins** (Greek *proteios*, "primary") are biopolymers of **amino acids** linked by **peptide bonds**. Besides C, H and O they contain **nitrogen** (about 16% of their mass) and often **sulfur**.

| Name | Amino acids |
|---|---|
| Dipeptide | 2 |
| Tripeptide | 3 |
| Oligopeptide | up to about 10 |
| Polypeptide | many (roughly 10–100) |
| Protein | usually more than 100 (insulin, with 51, is an exception called a protein) |

### Functions
Structure (collagen, keratin) · **enzymes** · hormones (insulin) · fluid balance · acid–base balance · **transport** (haemoglobin carries oxygen) · **antibodies** (immunity) · energy when needed. Proteins also make possible remarkable things such as bioluminescence and the electric organs of eels.

> **Scientists to know:** **G. N. Ramachandran** (India) — the Ramachandran plot and the triple helix of collagen; **Linus Pauling** — the α-helix and β-sheet; Nobel Prizes in Chemistry (1954) and Peace (1962).

## Structure of an amino acid
Every amino acid has a central **α-carbon** bonded to:

- an **amino group** (–NH~2~),
- a **carboxyl group** (–COOH),
- a **hydrogen atom**, and
- a **side chain (R group)**, which is different in each of the **20** amino acids.

Natural proteins use the **L-form** of amino acids.

## Classes by R group
| Class | Amino acids |
|---|---|
| Non-polar, aliphatic | Glycine, alanine, proline, valine, leucine, isoleucine, methionine |
| Aromatic | Phenylalanine, tyrosine, tryptophan |
| Polar, uncharged | Serine, threonine, cysteine, asparagine, glutamine |
| Positively charged (basic) | Lysine, arginine, histidine |
| Negatively charged (acidic) | Aspartate, glutamate |

## Essential amino acids
- **Essential** — must come from food. For adults there are **nine**: histidine, isoleucine, leucine, lysine, methionine, phenylalanine, threonine, tryptophan and valine.
- **Arginine** is **conditionally essential** — needed in the diet by growing children, premature infants and in illness. (Many textbooks list ten, including arginine — mnemonic "**MATT VIL PHLy**".)
- **Non-essential** — the body makes them.

## Zwitterions and the isoelectric point
In water near neutral pH, an amino acid carries both **–NH~3~^+^** and **–COO^−^**: a **zwitterion** (a dipolar ion with no net charge).

The **isoelectric point (pI)** is the pH at which the net charge is **zero**. For an amino acid without an ionisable side chain:

**pI = (pK~1~ + pK~2~) ÷ 2**

At its pI an amino acid is **least soluble** and **does not move in an electric field** — the basis of separating proteins by **electrophoresis**.
`,
          questions: [
            num(
              'An amino acid without an ionisable side chain has pK~1~ = 2.34 and pK~2~ = 9.69. What is its isoelectric point? (2 decimal places)',
              6.02,
              'pI = (2.34 + 9.69) ÷ 2 = 6.015 ≈ 6.02 (this is glycine).',
              'medium',
              0.01,
            ),
            mcq(
              'Which amino acid is **aromatic**?',
              ['Glycine', 'Tryptophan', 'Lysine', 'Serine'],
              1,
              'Phenylalanine, tyrosine and tryptophan are aromatic.',
            ),
            match(
              'Match each amino acid with its class.',
              [
                ['Lysine', 'Positively charged'],
                ['Glutamate', 'Negatively charged'],
                ['Valine', 'Non-polar, aliphatic'],
                ['Serine', 'Polar, uncharged'],
              ],
              'Classes are based on the R group.',
            ),
            tf(
              'At its isoelectric point, an amino acid moves fastest in an electric field.',
              false,
              'At the pI the net charge is zero, so it does not move.',
            ),
            multi(
              'Which of these are **essential** amino acids for adults?',
              ['Leucine', 'Lysine', 'Tryptophan', 'Glycine', 'Alanine'],
              [0, 1, 2],
              'Glycine and alanine are made by the body.',
            ),
            blank(
              'A molecule carrying both a positive and a negative charge but no net charge, like an amino acid at neutral pH, is called a [[b1]].',
              { b1: ['zwitterion'] },
              'Zwitterion = dipolar ion.',
              'easy',
            ),
          ],
        },
        {
          key: 'bio-ch5-t2',
          title: { en: 'The peptide bond and protein structure', ne: 'पेप्टाइड बन्ड र प्रोटिनको संरचना' },
          estimatedMinutes: 20,
          note: `
## The peptide bond
A **peptide bond** is an **amide bond** between the **carboxyl group** of one amino acid and the **amino group** of the next. Forming it releases **one water molecule** (condensation). The chain has a free amino end (**N-terminus**) and a free carboxyl end (**C-terminus**).

## Four levels of protein structure
| Level | What it is | Held by |
|---|---|---|
| **Primary** | The **sequence** of amino acids in the chain | Peptide bonds |
| **Secondary** | Local folding of the backbone into **α-helices** and **β-pleated sheets** | Hydrogen bonds between backbone C=O and N–H |
| **Tertiary** | The overall **3-D shape** of one polypeptide | Interactions between side chains far apart in the sequence: **disulfide (S–S) bridges**, hydrophobic interactions, ionic bonds, hydrogen bonds |
| **Quaternary** | Two or more polypeptides combined | The same forces between chains — e.g. **haemoglobin** has four subunits |

The sequence decides the shape, and the **shape decides the function**.

## Denaturation
**Denaturation** is the loss of secondary, tertiary and quaternary structure — and so of function — caused by **heat, extreme pH, heavy metals, alcohol or detergents**. The **primary structure (peptide bonds) stays intact**. Example: cooking an egg turns the clear albumin white and solid.

## Conjugated proteins
Proteins joined to a **non-protein (prosthetic) group**:

| Type | Prosthetic group | Example |
|---|---|---|
| Glycoprotein | Carbohydrate | Antibodies, mucins |
| Lipoprotein | Lipid | LDL, HDL |
| Haemoprotein | Haem | Haemoglobin, myoglobin |
| Nucleoprotein | Nucleic acid | Chromatin |

## Proteins in the cell membrane
The membrane is a **lipid bilayer** with **proteins** embedded in it and **carbohydrate chains** on the outer surface — a structure that brings together all the biomolecule families.
`,
          questions: [
            mcq(
              'Which level of protein structure is simply the **sequence** of amino acids?',
              ['Primary', 'Secondary', 'Tertiary', 'Quaternary'],
              0,
              'Primary structure = the order of amino acids.',
              'easy',
            ),
            mcq(
              'α-helices and β-pleated sheets belong to which level of structure?',
              ['Primary', 'Secondary', 'Tertiary', 'Quaternary'],
              1,
              'They are local backbone folds held by hydrogen bonds.',
              'easy',
            ),
            tf(
              'Denaturation breaks the peptide bonds of a protein.',
              false,
              'Denaturation destroys the higher-level structure; the primary structure remains.',
            ),
            mcq(
              'Haemoglobin, made of four polypeptide subunits, is an example of which level of structure?',
              ['Primary', 'Secondary', 'Tertiary', 'Quaternary'],
              3,
              'Quaternary structure combines several polypeptides.',
            ),
            num(
              'How many water molecules are released when a tripeptide is formed from three amino acids?',
              2,
              'Two peptide bonds form, each releasing one water molecule.',
            ),
          ],
        },
      ],
      revision: `
- Proteins = amino acids joined by **peptide bonds**; ~16% nitrogen. Functions: structure, enzymes, hormones, transport, antibodies.
- Amino acid: α-carbon + –NH~2~ + –COOH + H + **R group**; **20** kinds; natural L-form.
- Classes: non-polar aliphatic, aromatic (Phe, Tyr, Trp), polar uncharged, positive (Lys, Arg, His), negative (Asp, Glu).
- Essential (adults): His, Ile, Leu, Lys, Met, Phe, Thr, Trp, Val (+ Arg conditionally).
- **Zwitterion**; **pI = (pK~1~ + pK~2~) ÷ 2**; no net charge, no movement in electrophoresis.
- Structure: **primary** (sequence), **secondary** (α-helix, β-sheet; H-bonds), **tertiary** (3-D; S–S bridges), **quaternary** (several chains).
- Denaturation keeps the primary structure.
`,
    },
    {
      key: 'bio-ch6',
      numberLabel: '6',
      title: { en: 'Nucleic Acids', ne: 'न्युक्लिक एसिड' },
      description: "Nucleotides, the phosphodiester bond, Chargaff's rules and the DNA double helix.",
      topics: [
        {
          key: 'bio-ch6-t1',
          title: { en: 'Nucleotides and the phosphodiester bond', ne: 'न्युक्लियोटाइड र फस्फोडाइएस्टर बन्ड' },
          estimatedMinutes: 20,
          note: `
## Discovery
In **1869 Friedrich Miescher** isolated a substance from cell nuclei that he called **"nuclein"**. Because it was found in the **nucleus** and later in **chromosomes**, it was suspected to carry genetic information — today we call it **DNA**.

## Building blocks
| Term | Made of |
|---|---|
| **Nucleoside** | Nitrogenous base + pentose sugar |
| **Nucleotide** | Nitrogenous base + pentose sugar + **phosphate** |

- **Sugar:** **deoxyribose** in DNA; **ribose** in RNA.
- **Bases:**
  - **Purines** — two rings: **adenine (A)** and **guanine (G)**;
  - **Pyrimidines** — one ring: **cytosine (C)**, **thymine (T)** in DNA, **uracil (U)** in RNA.

| | DNA | RNA |
|---|---|---|
| Sugar | Deoxyribose | Ribose |
| Bases | A, G, C, **T** | A, G, C, **U** |
| Strands | Usually double | Usually single |

## The phosphodiester bond
Nucleotides are joined into a chain by **phosphodiester bonds**: a covalent link between the **phosphate on the 5′ carbon** of one nucleotide's sugar and the **3′ carbon** of the next sugar.

- This gives a **sugar–phosphate backbone** with the bases sticking out.
- The two ends differ: the **5′ end** has a free phosphate, the **3′ end** a free –OH. Sequences are written **5′ → 3′**.
- The bond is very strong — DNA survives boiling and even autoclaving, which is why it is so stable.
`,
          questions: [
            mcq(
              'A **nucleotide** is made of…',
              [
                'a base and a sugar',
                'a base, a sugar and a phosphate',
                'a sugar and a phosphate',
                'two bases and a sugar',
              ],
              1,
              'Nucleoside + phosphate = nucleotide.',
              'easy',
            ),
            multi(
              'Which bases are **purines**?',
              ['Adenine', 'Guanine', 'Cytosine', 'Thymine'],
              [0, 1],
              'Purines (two rings): A and G. Pyrimidines: C, T, U.',
              'easy',
            ),
            tf('Uracil replaces thymine in RNA.', true, 'RNA uses uracil; DNA uses thymine.', 'easy'),
            blank(
              'Nucleotides in a DNA strand are joined by [[b1]] bonds between the 5′ phosphate of one and the 3′ carbon of the next.',
              { b1: ['phosphodiester'] },
              'Phosphodiester bonds form the sugar–phosphate backbone.',
            ),
            mcq(
              'Who first isolated "nuclein" from cell nuclei, in 1869?',
              ['Gregor Mendel', 'Friedrich Miescher', 'Rosalind Franklin', 'Erwin Chargaff'],
              1,
              'Friedrich Miescher isolated nuclein in 1869.',
            ),
          ],
        },
        {
          key: 'bio-ch6-t2',
          title: { en: 'The DNA double helix', ne: 'DNA डबल हेलिक्स' },
          estimatedMinutes: 25,
          note: `
## The evidence
**James Watson and Francis Crick** proposed the double-helix model in **1953**, using two kinds of evidence:

1. **Chargaff's rules** (Erwin Chargaff) — in double-stranded DNA:
   - the amount of **A equals T**, and **G equals C**;
   - so purines (A + G) are about **50%** and pyrimidines (T + C) about 50%;
   - the **GC content varies between species**.
2. **X-ray diffraction images** by **Rosalind Franklin and Maurice Wilkins**, showing a helix with regular repeats of **0.34 nm** and **3.4 nm**.

| Organism | %A | %T | %G | %C | %GC |
|---|---|---|---|---|---|
| Human | 31.0 | 31.5 | 19.1 | 18.4 | 37.5 |
| Maize | 25.6 | 25.3 | 24.5 | 24.6 | 49.1 |
| Fruit fly | 27.3 | 27.6 | 22.5 | 22.5 | 45.0 |

## Features of the double helix (B-DNA)
1. **Two polynucleotide strands** wound into a **right-handed** helix.
2. The strands are **antiparallel** — one runs 5′→3′, the other 3′→5′.
3. The **sugar–phosphate backbones are outside**; the **bases point inwards**.
4. **Complementary base pairs** are held by hydrogen bonds: **A pairs with T (2 hydrogen bonds)**, **G pairs with C (3 hydrogen bonds)**. Example: 5′-TATTCCGA-3′ pairs with 3′-ATAAGGCT-5′.
5. Adjacent base pairs are **0.34 nm** apart; one full turn is **3.4 nm**, about **10 base pairs**.
6. The backbones are unevenly spaced, forming **major and minor grooves**.

Because G–C pairs have three hydrogen bonds, DNA with more GC is harder to separate (melts at a higher temperature).

## Other forms of DNA
| Form | Handedness | Base pairs per turn | Shape |
|---|---|---|---|
| **B-DNA** | Right | About 10 | The common form in cells, about 2 nm wide |
| **A-DNA** | Right | About 11 | Shorter and wider; seen in some DNA–protein complexes and dehydrated DNA |
| **Z-DNA** | **Left** | About 12 | Longer and thinner (about 1.8 nm); zig-zag backbone |

## The Nobel Prize
The **1962 Nobel Prize in Physiology or Medicine** went to **Watson, Crick and Wilkins**. **Rosalind Franklin**, whose X-ray images were crucial, had died in 1958; Nobel Prizes are not awarded after death.
`,
          questions: [
            num(
              'A DNA sample contains 30% adenine. What percentage of it is guanine?',
              20,
              'A = T = 30%, so A + T = 60%; G + C = 40%, and G = C = 20%.',
              'medium',
            ),
            num(
              'How many hydrogen bonds hold a G–C base pair together?',
              3,
              'G–C pairs have 3 hydrogen bonds; A–T pairs have 2.',
              'easy',
            ),
            mcq(
              'Which form of DNA is **left-handed**?',
              ['A-DNA', 'B-DNA', 'Z-DNA', 'All forms'],
              2,
              'Z-DNA is a left-handed helix.',
            ),
            blank(
              'The complementary strand of 5′-ATGC-3′ is 3′-[[b1]]-5′.',
              { b1: ['TACG'] },
              'A pairs with T and G with C, read on the antiparallel strand.',
            ),
            tf(
              'The two strands of the DNA double helix run in the same direction (parallel).',
              false,
              'They are antiparallel: 5′→3′ and 3′→5′.',
              'easy',
            ),
            num(
              'In B-DNA, one complete turn of the helix is 3.4 nm and adjacent base pairs are 0.34 nm apart. How many base pairs are there per turn?',
              10,
              '3.4 ÷ 0.34 = 10.',
              'easy',
            ),
          ],
        },
      ],
      revision: `
- **Miescher (1869)** — "nuclein". Nucleoside = base + sugar; **nucleotide** = base + sugar + phosphate.
- Purines **A, G** (two rings); pyrimidines **C, T, U** (one ring). DNA: deoxyribose, T; RNA: ribose, U.
- **Phosphodiester bond**: 5′ phosphate to 3′ carbon; strands written 5′→3′; very stable.
- **Chargaff:** A = T, G = C; GC% varies by species.
- **Watson & Crick (1953)** with Franklin & Wilkins' X-ray data: right-handed, antiparallel, backbone outside, **A–T (2 H-bonds), G–C (3)**, 0.34 nm per base pair, 3.4 nm per turn (~10 bp), major and minor grooves.
- Forms: **B** (right, ~10 bp), **A** (right, ~11), **Z** (left, ~12).
- **Nobel 1962:** Watson, Crick, Wilkins.
`,
    },
  ],
};
