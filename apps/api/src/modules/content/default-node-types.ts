/**
 * Category types created by migration `exam_node_types` (keep in sync). Used to restore reference data after test and
 * E2E database resets; production gets them from the migration and admins change them in the CMS.
 */
export const DEFAULT_NODE_TYPES = [
  {
    key: 'authority',
    name: { en: 'Authority', ne: 'निकाय' },
    rank: 10,
    topLevel: true,
    canHavePapers: false,
  },
  { key: 'level', name: { en: 'Level', ne: 'तह' }, rank: 20, topLevel: false, canHavePapers: false },
  { key: 'service', name: { en: 'Service', ne: 'सेवा' }, rank: 30, topLevel: false, canHavePapers: false },
  { key: 'group', name: { en: 'Group', ne: 'समूह' }, rank: 40, topLevel: false, canHavePapers: false },
  {
    key: 'sub_group',
    name: { en: 'Sub-group', ne: 'उपसमूह' },
    rank: 50,
    topLevel: false,
    canHavePapers: false,
  },
  { key: 'post', name: { en: 'Post', ne: 'पद' }, rank: 60, topLevel: false, canHavePapers: true },
  {
    key: 'exam_stage',
    name: { en: 'Exam stage', ne: 'परीक्षा चरण' },
    rank: 70,
    topLevel: false,
    canHavePapers: true,
  },
] as const;
