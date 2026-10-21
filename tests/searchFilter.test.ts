import { describe, it, expect } from 'vitest'
import { filterWorktrees, filterJunctions } from '../src/ui/utils/searchFilter.js'
import { WorktreeNode, JunctionLink, CollisionWarning } from '../src/core/types.js'

describe('Vim-Style Instant Search & Quick Filter Cycling (BAN-5)', () => {
  const dummyWorktrees: WorktreeNode[] = [
    {
      id: 'repoA:main',
      relPath: 'main',
      repoAlias: 'repoA',
      repoPath: '/repoA',
      worktreePath: '/repoA/main',
      branch: 'main',
      headSha: 'abc111',
      isBare: false,
      dirtyCount: 0,
      ahead: 0,
      behind: 0,
      recentCommits: [],
      nodeModulesType: 'own',
      detectedEcosystems: ['node'],
      agentStatus: { isActive: false },
    },
    {
      id: 'repoA:feat-login',
      relPath: 'feat-login',
      repoAlias: 'repoA',
      repoPath: '/repoA',
      worktreePath: '/repoA/feat-login',
      branch: 'feat-login',
      headSha: 'abc222',
      isBare: false,
      dirtyCount: 3,
      ahead: 1,
      behind: 0,
      recentCommits: [],
      nodeModulesType: 'own',
      detectedEcosystems: ['node', 'python'],
      agentStatus: { isActive: true, reason: 'git-lock' },
    },
    {
      id: 'repoB:develop',
      relPath: 'develop',
      repoAlias: 'repoB',
      repoPath: '/repoB',
      worktreePath: '/repoB/develop',
      branch: 'develop',
      headSha: 'abc333',
      isBare: false,
      dirtyCount: 0,
      ahead: 0,
      behind: 0,
      recentCommits: [],
      nodeModulesType: 'shared',
      detectedEcosystems: ['go'],
      agentStatus: { isActive: false },
    },
  ]

  const dummyWarnings: CollisionWarning[] = [
    {
      id: 'warn-1',
      type: 'BRANCH_MISMATCH',
      severity: 'warning',
      message: 'Branch mismatch',
      affectedWorktreeIds: ['repoB:develop'],
    },
  ]

  describe('filterWorktrees modes', () => {
    it('returns all worktrees under "all" filter mode with no query', () => {
      const res = filterWorktrees(dummyWorktrees, 'all', '', dummyWarnings)
      expect(res).toHaveLength(3)
    })

    it('filters for active agents under "agents" mode', () => {
      const res = filterWorktrees(dummyWorktrees, 'agents', '', dummyWarnings)
      expect(res).toHaveLength(1)
      expect(res[0].id).toBe('repoA:feat-login')
    })

    it('filters for collision-affected worktrees under "collisions" mode', () => {
      const res = filterWorktrees(dummyWorktrees, 'collisions', '', dummyWarnings)
      expect(res).toHaveLength(1)
      expect(res[0].id).toBe('repoB:develop')
    })

    it('filters for dirty worktrees under "dirty" mode', () => {
      const res = filterWorktrees(dummyWorktrees, 'dirty', '', dummyWarnings)
      expect(res).toHaveLength(1)
      expect(res[0].id).toBe('repoA:feat-login')
    })
  })

  describe('filterWorktrees search query', () => {
    it('matches by substring in branch name', () => {
      const res = filterWorktrees(dummyWorktrees, 'all', 'login', dummyWarnings)
      expect(res).toHaveLength(1)
      expect(res[0].branch).toBe('feat-login')
    })

    it('matches by substring in detected ecosystem', () => {
      const res = filterWorktrees(dummyWorktrees, 'all', 'python', dummyWarnings)
      expect(res).toHaveLength(1)
      expect(res[0].id).toBe('repoA:feat-login')
    })

    it('matches case-insensitively', () => {
      const res = filterWorktrees(dummyWorktrees, 'all', 'REPOB', dummyWarnings)
      expect(res).toHaveLength(1)
      expect(res[0].id).toBe('repoB:develop')
    })
  })

  describe('filterJunctions', () => {
    const dummyJunctions: JunctionLink[] = [
      {
        sourceWorktreeId: 'app:feat-1',
        sourceWorktreePath: '/app/feat-1',
        packageName: '@scope/utils',
        linkPath: '/app/feat-1/node_modules/@scope/utils',
        targetRealPath: '/libs/utils',
        targetWorktreeId: 'utils:main',
        mechanism: 'fs-junction',
        isBroken: false,
        isHighlightedScope: true,
      },
      {
        sourceWorktreeId: 'web:develop',
        sourceWorktreePath: '/web/develop',
        packageName: '@scope/ui',
        linkPath: '/web/develop/node_modules/@scope/ui',
        targetRealPath: '/libs/ui',
        targetWorktreeId: 'ui:develop',
        mechanism: 'tsconfig-path',
        isBroken: false,
        isHighlightedScope: true,
      },
    ]

    it('matches junctions by package name', () => {
      const res = filterJunctions(dummyJunctions, 'utils')
      expect(res).toHaveLength(1)
      expect(res[0].packageName).toBe('@scope/utils')
    })

    it('matches junctions by mechanism', () => {
      const res = filterJunctions(dummyJunctions, 'tsconfig')
      expect(res).toHaveLength(1)
      expect(res[0].mechanism).toBe('tsconfig-path')
    })

    it('returns empty array when query does not match anything', () => {
      const res = filterJunctions(dummyJunctions, 'nonexistent')
      expect(res).toHaveLength(0)
    })
  })
})
