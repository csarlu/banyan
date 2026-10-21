import { describe, it, expect } from 'vitest'
import { quoteArg, safeToken, commentSafe } from '../src/core/shellSafe.js'
import { goAdapter } from '../src/core/adapters/goAdapter.js'
import { createWorktreeWithStrategy } from '../src/core/worktreeCreator.js'
import type { JunctionLink, WorktreeNode } from '../src/core/types.js'

const wt = { id: 'lib:x', worktreePath: '/p/lib-x' } as unknown as WorktreeNode
const link = (packageName: string, extra: Partial<JunctionLink> = {}): JunctionLink =>
  ({
    packageName,
    linkPath: '/p/app/node_modules/x',
    targetRealPath: '/p/lib',
    ...extra,
  }) as JunctionLink

describe('fix command hardening (command injection)', () => {
  it('refuses to embed shell metacharacters from a go.mod module name', () => {
    for (const evil of ['a;touch${IFS}pwned', 'a$(id)', 'a`id`', 'a|b', 'a&&b', 'a>b']) {
      const cmd = goAdapter.buildFixCommand(link(evil), wt)
      expect(cmd.startsWith('#')).toBe(true)
      expect(cmd).not.toContain('go mod edit')
    }
  })

  it('keeps readable go mod edit commands for legitimate module names', () => {
    expect(goAdapter.buildFixCommand(link('github.com/org/lib'), wt)).toBe(
      'go mod edit -replace=github.com/org/lib=/p/lib-x',
    )
  })

  it('single-quotes values with shell-active characters and never leaves $ or backticks in double quotes', () => {
    for (const v of ['/p/$(id)', '/p/`id`', '/p/a"b']) {
      const q = quoteArg(v)
      expect(q.startsWith("'")).toBe(true)
    }
    expect(quoteArg('/p/plain path')).toBe('"/p/plain path"')
  })

  it('strips newlines so a comment fix cannot smuggle a second command', () => {
    expect(commentSafe('a\nrm -rf /')).not.toMatch(/[\r\n]/)
    expect(quoteArg('a\nb')).not.toMatch(/[\r\n]/)
  })

  it('safeToken accepts normal module paths and rejects metacharacters', () => {
    expect(safeToken('github.com/acme/lib@v1.2.3')).not.toBeNull()
    expect(safeToken('a b')).toBeNull()
    expect(safeToken('a;b')).toBeNull()
  })

  it('rejects option-like or malformed branch names when creating worktrees', async () => {
    for (const branch of ['--orphan', '-f', 'a..b', 'a b', 'x.lock', '']) {
      const res = await createWorktreeWithStrategy({
        repoPath: '/nonexistent',
        branch,
        targetPath: '/tmp/x',
        strategy: 'clean',
      })
      expect(res.ok).toBe(false)
      expect(res.error).toContain('Invalid branch name')
    }
  })
})
