import { describe, it, expect } from 'vitest'
import { computeVisibleWindow } from '../src/ui/utils/viewportWindow.js'
import { formatWorktreeLabel } from '../src/ui/utils/formatters.js'
import { WorktreeNode } from '../src/core/types.js'

describe('Viewport Virtualization & Formatting (BAN-2 & BAN-1)', () => {
  describe('computeVisibleWindow', () => {
    const items = Array.from({ length: 25 }, (_, i) => `item-${i + 1}`)

    it('returns empty window for empty list', () => {
      const res = computeVisibleWindow([], 0, 10)
      expect(res.visibleItems).toEqual([])
      expect(res.startIndex).toBe(0)
      expect(res.endIndex).toBe(0)
      expect(res.hasMoreAbove).toBe(false)
      expect(res.hasMoreBelow).toBe(false)
    })

    it('returns all items if total items is less than or equal to maxVisibleRows', () => {
      const small = ['a', 'b', 'c']
      const res = computeVisibleWindow(small, 1, 10)
      expect(res.visibleItems).toEqual(small)
      expect(res.startIndex).toBe(0)
      expect(res.endIndex).toBe(3)
      expect(res.hasMoreAbove).toBe(false)
      expect(res.hasMoreBelow).toBe(false)
    })

    it('centers window around selected index at beginning', () => {
      const res = computeVisibleWindow(items, 0, 10)
      expect(res.startIndex).toBe(0)
      expect(res.endIndex).toBe(10)
      expect(res.visibleItems).toHaveLength(10)
      expect(res.visibleItems[0]).toBe('item-1')
      expect(res.hasMoreAbove).toBe(false)
      expect(res.hasMoreBelow).toBe(true)
    })

    it('centers window around selected index in the middle', () => {
      const res = computeVisibleWindow(items, 12, 10)
      // selectedIndex 12: half is 5 => startIndex 7, endIndex 17
      expect(res.startIndex).toBe(7)
      expect(res.endIndex).toBe(17)
      expect(res.visibleItems).toContain('item-13') // 0-based 12 is 'item-13'
      expect(res.hasMoreAbove).toBe(true)
      expect(res.hasMoreBelow).toBe(true)
    })

    it('clamps window cleanly when selected index is at the end', () => {
      const res = computeVisibleWindow(items, 24, 10)
      expect(res.startIndex).toBe(15)
      expect(res.endIndex).toBe(25)
      expect(res.visibleItems[res.visibleItems.length - 1]).toBe('item-25')
      expect(res.hasMoreAbove).toBe(true)
      expect(res.hasMoreBelow).toBe(false)
    })

    it('handles out of bounds selectedIndex gracefully', () => {
      const res = computeVisibleWindow(items, 999, 10)
      expect(res.startIndex).toBe(15)
      expect(res.endIndex).toBe(25)
    })
  })

  describe('formatWorktreeLabel', () => {
    it('returns repo alias if relPath === repoAlias', () => {
      const wt = {
        id: 'ashber-cli:ashber-cli',
        relPath: 'ashber-cli',
        repoAlias: 'ashber-cli',
      } as WorktreeNode
      expect(formatWorktreeLabel(wt)).toBe('ashber-cli')
    })

    it('returns repo alias if relPath is "." or empty', () => {
      const wt = {
        id: 'csluigmTaboom:',
        relPath: '.',
        repoAlias: 'csluigmTaboom',
      } as WorktreeNode
      expect(formatWorktreeLabel(wt)).toBe('csluigmTaboom')
    })

    it('preserves distinct subpath worktrees', () => {
      const wt = {
        id: 'synappz:wt-web/FFlashNote',
        relPath: 'wt-web/FFlashNote',
        repoAlias: 'synappz',
      } as WorktreeNode
      expect(formatWorktreeLabel(wt)).toBe('synappz:wt-web/FFlashNote')
    })
  })

  describe('Pedagogical Knowledge Base (BAN-3)', () => {
    it('documents SHARED_ENV_DIRTY in both Spanish and English', async () => {
      const { KNOWLEDGE_BASE } = await import('../src/docs/knowledgeBase.js')
      expect(KNOWLEDGE_BASE.es.SHARED_ENV_DIRTY).toBeDefined()
      expect(KNOWLEDGE_BASE.es.SHARED_ENV_DIRTY.id).toBe('SHARED_ENV_DIRTY')
      expect(KNOWLEDGE_BASE.es.SHARED_ENV_DIRTY.howToFix.length).toBeGreaterThan(0)

      expect(KNOWLEDGE_BASE.en.SHARED_ENV_DIRTY).toBeDefined()
      expect(KNOWLEDGE_BASE.en.SHARED_ENV_DIRTY.id).toBe('SHARED_ENV_DIRTY')
      expect(KNOWLEDGE_BASE.en.SHARED_ENV_DIRTY.howToFix.length).toBeGreaterThan(0)
    })
  })
})
