import type { LocalizedText } from '@tk/contracts';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from './api';

/** Admin-managed category type (`/admin/exam-node-types`). */
export interface NodeType {
  key: string;
  name: LocalizedText;
  description: LocalizedText | null;
  rank: number;
  topLevel: boolean;
  canHavePapers: boolean;
  active: boolean;
  nodeCount: number;
}

/** Category types from the API (ordered by rank) with a label lookup. */
export function useNodeTypes() {
  const query = useQuery({
    queryKey: ['exam-node-types'],
    queryFn: () => api.get<NodeType[]>('/admin/exam-node-types'),
    staleTime: 60_000,
  });
  // Memoised on the fetched data so callers can use these in hook dependency lists.
  return useMemo(() => {
    const types = query.data ?? [];
    const byKey = new Map(types.map((t) => [t.key, t]));
    return {
      isPending: query.isPending,
      types,
      byKey,
      label: (key: string) => byKey.get(key)?.name.en ?? byKey.get(key)?.name.ne ?? key,
    };
  }, [query.data, query.isPending]);
}

/** Types that may be placed directly under a parent of type `parentKey` (or at the top when null). */
export function childTypesOf(types: NodeType[], parentKey: string | null): NodeType[] {
  const active = types.filter((t) => t.active);
  if (!parentKey) return active.filter((t) => t.topLevel);
  const parent = types.find((t) => t.key === parentKey);
  if (!parent) return [];
  return active.filter((t) => !t.topLevel && t.rank > parent.rank);
}
