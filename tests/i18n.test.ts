import { describe, it, expect, afterEach } from 'vitest'
import { DICTIONARIES, detectDefaultLocale } from '../src/i18n/index.js'
import { MESSAGES, getMessages, localizeWarningMessage } from '../src/i18n/messages.js'
import { detectCollisions } from '../src/core/collisions.js'
import { formatStatusReport } from '../src/core/statusPrinter.js'
import type { JunctionLink, WorktreeNode, EcosystemSnapshot } from '../src/core/types.js'

/** Recursively collects the key paths of an object, descending into plain objects and arrays. */
function keyPaths(obj: unknown, prefix = ''): string[] {
  if (Array.isArray(obj)) {
    return [`${prefix}[${obj.length}]`, ...obj.flatMap((v, i) => keyPaths(v, `${prefix}[${i}]`))]
  }
  if (obj && typeof obj === 'object') {
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
      keyPaths(v, prefix ? `${prefix}.${k}` : k),
    )
  }
  return [prefix]
}

describe('i18n (en/es)', () => {
  const saved = { ...process.env }
  afterEach(() => {
    process.env = { ...saved }
  })

  it('keeps TUI dictionaries structurally identical between es and en', () => {
    expect(keyPaths(DICTIONARIES.en).sort()).toEqual(keyPaths(DICTIONARIES.es).sort())
  })

  it('keeps runtime message catalogs structurally identical between es and en', () => {
    expect(keyPaths(MESSAGES.en).sort()).toEqual(keyPaths(MESSAGES.es).sort())
  })

  it('defaults to English unless the environment asks for Spanish', () => {
    delete process.env.BANYAN_LANG
    delete process.env.LC_ALL
    process.env.LANG = 'fr_FR.UTF-8'
    expect(detectDefaultLocale()).toBe('en')
    process.env.LANG = 'es_ES.UTF-8'
    expect(detectDefaultLocale()).toBe('es')
    process.env.BANYAN_LANG = 'en'
    expect(detectDefaultLocale()).toBe('en')
  })

  it('interpolates runtime messages per locale', () => {
    expect(getMessages('en').cli.rulesAdded('AGENTS.md')).toContain('added to AGENTS.md')
    expect(getMessages('es').cli.rulesAdded('AGENTS.md')).toContain('añadidas a AGENTS.md')
  })

  it('localizes collision warnings (canonical English, Spanish via messageEs)', () => {
    const wt = (id: string, branch: string, dirty = 0): WorktreeNode =>
      ({
        id,
        repoAlias: id.split(':')[0],
        branch,
        dirtyCount: dirty,
        repoPath: `/r/${id}`,
        worktreePath: `/r/${id}`,
        agentStatus: { isActive: false },
        nodeModulesType: 'none',
      }) as unknown as WorktreeNode
    const worktrees = [wt('lib:main', 'main', 2), wt('a:a', 'a'), wt('b:b', 'b')]
    const link = (src: string): JunctionLink =>
      ({
        sourceWorktreeId: src,
        targetWorktreeId: 'lib:main',
        packageName: '@x/lib',
        isBroken: false,
        linkPath: '/l',
        targetRealPath: '/r/lib:main',
        ecosystem: 'node',
        targetBranch: 'main',
      }) as unknown as JunctionLink
    const warnings = detectCollisions(worktrees, [link('a:a'), link('b:b')])
    const w = warnings.find((x) => x.type === 'MULTI_CONSUMER_DIRTY')!
    expect(localizeWarningMessage(w, 'en')).toContain('Cross-contamination')
    expect(localizeWarningMessage(w, 'es')).toContain('Contaminación cruzada')

    const snapshot = {
      workspaceName: 'ws',
      timestamp: 0,
      muxBackend: 'tmux',
      worktrees,
      junctions: [link('a:a'), link('b:b')],
      warnings,
    } as EcosystemSnapshot
    expect(formatStatusReport(snapshot, 'en')).toContain('HEALTH & COLLISIONS')
    expect(formatStatusReport(snapshot, 'es')).toContain('SALUD & COLISIONES')
  })
})
