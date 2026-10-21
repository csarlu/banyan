import { CollisionWarning, JunctionLink, WorktreeNode } from '../../core/types.js'

export type WorktreeFilterMode = 'all' | 'agents' | 'collisions' | 'dirty'

export const WORKTREE_FILTER_MODES: WorktreeFilterMode[] = ['all', 'agents', 'collisions', 'dirty']

/**
 * Filters worktrees based on active filter mode (agents/collisions/dirty)
 * and substring search query.
 */
export function filterWorktrees(
  worktrees: WorktreeNode[],
  filterMode: WorktreeFilterMode = 'all',
  searchQuery: string = '',
  warnings: CollisionWarning[] = [],
): WorktreeNode[] {
  let list = worktrees

  // 1. Mode filtering
  if (filterMode === 'agents') {
    list = list.filter((w) => w.agentStatus.isActive)
  } else if (filterMode === 'collisions') {
    list = list.filter((w) => warnings.some((warn) => warn.affectedWorktreeIds.includes(w.id)))
  } else if (filterMode === 'dirty') {
    list = list.filter((w) => w.dirtyCount > 0)
  }

  // 2. Search query matching
  const q = searchQuery.trim().toLowerCase()
  if (!q) return list

  return list.filter((w) => {
    if (w.id.toLowerCase().includes(q)) return true
    if (w.repoAlias.toLowerCase().includes(q)) return true
    if (w.branch.toLowerCase().includes(q)) return true
    if (w.detectedEcosystems?.some((eco) => eco.toLowerCase().includes(q))) return true
    return false
  })
}

/**
 * Filters junctions based on substring search query across source, package, target, or mechanism.
 */
export function filterJunctions(
  junctions: JunctionLink[],
  searchQuery: string = '',
): JunctionLink[] {
  const q = searchQuery.trim().toLowerCase()
  if (!q) return junctions

  return junctions.filter((j) => {
    if (j.sourceWorktreeId.toLowerCase().includes(q)) return true
    if (j.packageName.toLowerCase().includes(q)) return true
    if (j.targetWorktreeId && j.targetWorktreeId.toLowerCase().includes(q)) return true
    if (j.mechanism && j.mechanism.toLowerCase().includes(q)) return true
    return false
  })
}
