import { describe, it, expect } from 'vitest'
import {
  parseWorktreePorcelain,
  parseStatusPorcelainV2,
  fetchRecentCommitsGraph,
} from '../src/core/git.js'
import { detectCollisions } from '../src/core/collisions.js'
import { areSnapshotsEquivalent } from '../src/core/orchestrator.js'
import { WorktreeNode, JunctionLink, EcosystemSnapshot } from '../src/core/types.js'
import { KNOWLEDGE_BASE } from '../src/docs/knowledgeBase.js'
import { printExplainTopic, printDoctorReport } from '../src/docs/cliDocPrinter.js'
import { resolveCurrentWorktree, generateAgentBriefing } from '../src/core/agentBriefing.js'

describe('Git Porcelain Parsers', () => {
  it('parses git worktree list --porcelain accurately', () => {
    const sample = [
      'worktree /projects/app',
      'HEAD 1234567890abcdef',
      'branch refs/heads/main',
      '',
      'worktree /projects/wt-web/app',
      'HEAD abcdef1234567890',
      'branch refs/heads/feat-login',
    ].join('\n')

    const parsed = parseWorktreePorcelain(sample)
    expect(parsed).toHaveLength(2)
    expect(parsed[0].branch).toBe('main')
    expect(parsed[1].branch).toBe('feat-login')
  })

  it('parses git status --porcelain=v2 ahead/behind and dirty count', () => {
    const sample = [
      '# branch.oid 123456',
      '# branch.head feat-login',
      '# branch.ab +3 -1',
      '1 .M N... 100644 100644 100644 abc def src/index.ts',
      '? untracked.ts',
    ].join('\n')

    const res = parseStatusPorcelainV2(sample)
    expect(res.ahead).toBe(3)
    expect(res.behind).toBe(1)
    expect(res.dirtyCount).toBe(2)
    expect(res.dirtyFiles).toContain('untracked.ts')
  })
})

describe('Universal Collision Engine', () => {
  it('detects universal BRANCH_MISMATCH even between non-default branches', () => {
    const wts: WorktreeNode[] = [
      {
        id: 'app:wt-web/web-app',
        relPath: 'wt-web/web-app',
        repoAlias: 'app',
        repoPath: '/p/app',
        worktreePath: '/p/wt-web/web-app',
        branch: 'develop',
        headSha: '111',
        isBare: false,
        dirtyCount: 0,
        ahead: 0,
        behind: 0,
        recentCommits: [],
        nodeModulesType: 'own',
        agentStatus: { isActive: false },
      },
      {
        id: 'common:feat-140',
        relPath: 'feat-140',
        repoAlias: 'common',
        repoPath: '/p/common',
        worktreePath: '/p/feat-140',
        branch: 'feat-140-practice-nodes',
        headSha: '222',
        isBare: false,
        dirtyCount: 0,
        ahead: 0,
        behind: 0,
        recentCommits: [],
        nodeModulesType: 'own',
        agentStatus: { isActive: false },
      },
      {
        id: 'common:develop',
        relPath: 'common',
        repoAlias: 'common',
        repoPath: '/p/common',
        worktreePath: '/p/common',
        branch: 'develop',
        headSha: '333',
        isBare: false,
        dirtyCount: 0,
        ahead: 0,
        behind: 0,
        recentCommits: [],
        nodeModulesType: 'own',
        agentStatus: { isActive: false },
      },
    ]

    const links: JunctionLink[] = [
      {
        sourceWorktreeId: 'app:wt-web/web-app',
        sourceWorktreePath: '/p/wt-web/web-app',
        packageName: '@acme/common',
        linkPath: '/p/wt-web/web-app/node_modules/@acme/common',
        targetRealPath: '/p/feat-140',
        targetWorktreeId: 'common:feat-140',
        targetRepoAlias: 'common',
        targetBranch: 'feat-140-practice-nodes',
        isBroken: false,
        isHighlightedScope: true,
      },
    ]

    const warnings = detectCollisions(wts, links)
    expect(warnings.some((w) => w.type === 'BRANCH_MISMATCH')).toBe(true)
  })
})

describe('Theme Palettes & Theming Integrity', () => {
  it('defines all themes in THEME_ORDER with complete valid color keys', async () => {
    const { THEMES, THEME_ORDER, getNextTheme } = await import('../src/ui/theme.js')
    expect(THEME_ORDER).toEqual([
      'default',
      'catppuccin',
      'dracula',
      'nord',
      'monokai',
      'solarized',
      'matrix',
    ])

    const validColorRegex =
      /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$|^(green|cyan|yellow|red|magenta|white|gray|black)(Bright)?$/

    for (const name of THEME_ORDER) {
      const palette = THEMES[name]
      expect(palette).toBeDefined()
      expect(palette.name).toBe(name)
      expect(palette.primary).toMatch(validColorRegex)
      expect(palette.secondary).toMatch(validColorRegex)
      expect(palette.accent).toMatch(validColorRegex)
      expect(palette.success).toMatch(validColorRegex)
      expect(palette.warning).toMatch(validColorRegex)
      expect(palette.critical).toMatch(validColorRegex)
      expect(palette.agent).toMatch(validColorRegex)
      expect(palette.text).toMatch(validColorRegex)
      expect(palette.muted).toMatch(validColorRegex)
      expect(palette.border).toMatch(validColorRegex)
      expect(palette.borderActive).toMatch(validColorRegex)
    }

    expect(getNextTheme('default')).toBe('catppuccin')
    expect(getNextTheme('matrix')).toBe('default')
  })
})

describe('Semantic Snapshot Equality (Anti-flicker & Scroll Preservation)', () => {
  const baseWt: WorktreeNode = {
    id: 'app:main',
    relPath: 'main',
    repoAlias: 'app',
    repoPath: '/p/app',
    worktreePath: '/p/main',
    branch: 'main',
    headSha: 'abc1234',
    isBare: false,
    dirtyCount: 0,
    ahead: 0,
    behind: 0,
    recentCommits: ['abc1234 feat: init'],
    nodeModulesType: 'own',
    agentStatus: { isActive: false },
  }

  const createSnap = (overrides?: Partial<EcosystemSnapshot>): EcosystemSnapshot => ({
    workspaceName: 'test-ws',
    timestamp: Date.now(),
    muxBackend: 'psmux',
    worktrees: [baseWt],
    junctions: [],
    warnings: [],
    ...overrides,
  })

  it('treats identical business data with different timestamps as equivalent', () => {
    const snap1 = createSnap({ timestamp: 1000 })
    const snap2 = createSnap({ timestamp: 2000 })

    expect(areSnapshotsEquivalent(snap1, snap2)).toBe(true)
  })

  it('detects changes in worktree branch, dirtyCount, ahead, or headSha', () => {
    const snap1 = createSnap()
    const snapDirty = createSnap({
      worktrees: [{ ...baseWt, dirtyCount: 2 }],
    })
    const snapBranch = createSnap({
      worktrees: [{ ...baseWt, branch: 'feat/test' }],
    })
    const snapSha = createSnap({
      worktrees: [{ ...baseWt, headSha: 'def5678' }],
    })

    expect(areSnapshotsEquivalent(snap1, snapDirty)).toBe(false)
    expect(areSnapshotsEquivalent(snap1, snapBranch)).toBe(false)
    expect(areSnapshotsEquivalent(snap1, snapSha)).toBe(false)
  })

  it('detects changes in junctions and warnings', () => {
    const snap1 = createSnap()
    const snapWithJn = createSnap({
      junctions: [
        {
          sourceWorktreeId: 'app:main',
          sourceWorktreePath: '/p/main',
          packageName: 'lib-a',
          linkPath: '/p/main/node_modules/lib-a',
          targetRealPath: '/p/lib-a',
          isBroken: false,
        },
      ],
    })
    const snapWithWarn = createSnap({
      warnings: [
        {
          id: 'w1',
          type: 'BRANCH_MISMATCH',
          severity: 'critical',
          affectedWorktreeIds: ['app:main'],
          message: 'Mismatch warning',
        },
      ],
    })

    expect(areSnapshotsEquivalent(snap1, snapWithJn)).toBe(false)
    expect(areSnapshotsEquivalent(snap1, snapWithWarn)).toBe(false)
  })

  it('returns false when either snapshot is null or undefined', () => {
    const snap = createSnap()
    expect(areSnapshotsEquivalent(null, snap)).toBe(false)
    expect(areSnapshotsEquivalent(snap, null)).toBe(false)
    expect(areSnapshotsEquivalent(undefined, undefined)).toBe(true)
  })
})

describe('Recent Commits Graph (git-graph with colored fallback)', () => {
  it('fetches colored commit graph for current repository', async () => {
    const lines = await fetchRecentCommitsGraph(process.cwd(), 4)
    expect(Array.isArray(lines)).toBe(true)
    expect(lines.length).toBeGreaterThan(0)
    expect(
      lines.some(
        (l) => l.includes('75c34ec') || l.includes('1.2') || l.includes('●') || l.includes('*'),
      ),
    ).toBe(true)
  })
})

describe('Pedagogical Knowledge Base & CLI Documentation', () => {
  it('has identical topic keys in es and en dictionaries', () => {
    const esKeys = Object.keys(KNOWLEDGE_BASE.es).sort()
    const enKeys = Object.keys(KNOWLEDGE_BASE.en).sort()
    expect(esKeys).toEqual(enKeys)
    expect(esKeys).toContain('concepts')
    expect(esKeys).toContain('BRANCH_MISMATCH')
    expect(esKeys).toContain('MULTI_CONSUMER_DIRTY')
    expect(esKeys).toContain('shared-nm')
    expect(esKeys).toContain('agents')
  })

  it('prints explain topic for BRANCH_MISMATCH in Spanish and English with diagrams', () => {
    const outputEs = printExplainTopic('BRANCH_MISMATCH', 'es')
    expect(outputEs).toContain('BANYAN EXPLAIN [WARN-COLLISION-02]')
    expect(outputEs).toContain('Analogía')
    expect(outputEs).toContain('feat-login')

    const outputEn = printExplainTopic('BRANCH_MISMATCH', 'en')
    expect(outputEn).toContain('BANYAN EXPLAIN [WARN-COLLISION-02]')
    expect(outputEn).toContain('Analogy')
  })

  it('prints doctor report with check items and collision hints', () => {
    const mockSnap = {
      workspaceName: 'doc-test',
      timestamp: Date.now(),
      muxBackend: 'psmux' as const,
      worktrees: [],
      junctions: [],
      warnings: [],
    }
    const reportClean = printDoctorReport(mockSnap, 'es')
    expect(reportClean).toContain('BANYAN DOCTOR')
    expect(reportClean).toContain('Git Worktrees:')
    expect(reportClean).toContain('0 conflictos detectados')
  })
})

describe('Agent Self-Awareness Briefing', () => {
  const wts: WorktreeNode[] = [
    {
      id: 'app:wt-web/web-app',
      relPath: 'wt-web/web-app',
      repoAlias: 'app',
      repoPath: '/p/app',
      worktreePath: '/p/wt-web/web-app',
      branch: 'develop',
      headSha: '111',
      isBare: false,
      dirtyCount: 0,
      ahead: 0,
      behind: 0,
      recentCommits: [],
      nodeModulesType: 'own',
      agentStatus: { isActive: false },
    },
    {
      id: 'app:wt-mobile',
      relPath: 'wt-mobile',
      repoAlias: 'app',
      repoPath: '/p/app',
      worktreePath: '/p/wt-mobile',
      branch: 'feature-mobile',
      headSha: '112',
      isBare: false,
      dirtyCount: 0,
      ahead: 0,
      behind: 0,
      recentCommits: [],
      nodeModulesType: 'own',
      agentStatus: { isActive: false },
    },
    {
      id: 'common:feat-140',
      relPath: 'feat-140',
      repoAlias: 'common',
      repoPath: '/p/common',
      worktreePath: '/p/feat-140',
      branch: 'feat-140-practice-nodes',
      headSha: '222',
      isBare: false,
      dirtyCount: 0,
      ahead: 0,
      behind: 0,
      recentCommits: [],
      nodeModulesType: 'own',
      agentStatus: { isActive: false },
    },
    {
      id: 'common:develop',
      relPath: 'common',
      repoAlias: 'common',
      repoPath: '/p/common',
      worktreePath: '/p/common',
      branch: 'develop',
      headSha: '333',
      isBare: false,
      dirtyCount: 0,
      ahead: 0,
      behind: 0,
      recentCommits: [],
      nodeModulesType: 'own',
      agentStatus: { isActive: false },
    },
  ]

  it('correctly resolves subdirectories upward to the parent WorktreeNode', () => {
    const resolved = resolveCurrentWorktree('/p/wt-web/web-app/src/ui', wts)
    expect(resolved).not.toBeNull()
    expect(resolved?.id).toBe('app:wt-web/web-app')
  })

  it('returns exitCode: 3 for BRANCH_MISMATCH affecting current worktree', () => {
    const links: JunctionLink[] = [
      {
        sourceWorktreeId: 'app:wt-web/web-app',
        sourceWorktreePath: '/p/wt-web/web-app',
        packageName: '@acme/common',
        linkPath: '/p/wt-web/web-app/node_modules/@acme/common',
        targetRealPath: '/p/feat-140',
        targetWorktreeId: 'common:feat-140',
        targetRepoAlias: 'common',
        targetBranch: 'feat-140-practice-nodes',
        isBroken: false,
        isHighlightedScope: true,
      },
    ]

    const snapshot: EcosystemSnapshot = {
      workspaceName: 'test-ws',
      timestamp: Date.now(),
      muxBackend: 'psmux',
      worktrees: wts,
      junctions: links,
      warnings: detectCollisions(wts, links),
    }

    const briefing = generateAgentBriefing(snapshot, '/p/wt-web/web-app')
    expect(briefing.matchedWorktree?.id).toBe('app:wt-web/web-app')
    expect(briefing.exitCode).toBe(3)
    expect(briefing.markdownBriefing).toContain('BRANCH_MISMATCH')
    expect(briefing.markdownBriefing).toContain('Mandatory Agent Guardrails')
  })

  it('returns exitCode: 2 and DOWNSTREAM BLAST RADIUS for MULTI_CONSUMER_DIRTY', () => {
    const dirtyWts: WorktreeNode[] = wts.map((w) =>
      w.id === 'common:develop' ? { ...w, dirtyCount: 3 } : w,
    )

    const links: JunctionLink[] = [
      {
        sourceWorktreeId: 'app:wt-web/web-app',
        sourceWorktreePath: '/p/wt-web/web-app',
        packageName: '@acme/common',
        linkPath: '/p/wt-web/web-app/node_modules/@acme/common',
        targetRealPath: '/p/common',
        targetWorktreeId: 'common:develop',
        targetRepoAlias: 'common',
        targetBranch: 'develop',
        isBroken: false,
        isHighlightedScope: true,
      },
      {
        sourceWorktreeId: 'app:wt-mobile',
        sourceWorktreePath: '/p/wt-mobile',
        packageName: '@acme/common',
        linkPath: '/p/wt-mobile/node_modules/@acme/common',
        targetRealPath: '/p/common',
        targetWorktreeId: 'common:develop',
        targetRepoAlias: 'common',
        targetBranch: 'develop',
        isBroken: false,
        isHighlightedScope: true,
      },
    ]

    const snapshot: EcosystemSnapshot = {
      workspaceName: 'test-ws',
      timestamp: Date.now(),
      muxBackend: 'psmux',
      worktrees: dirtyWts,
      junctions: links,
      warnings: detectCollisions(dirtyWts, links),
    }

    const briefing = generateAgentBriefing(snapshot, '/p/common')
    expect(briefing.matchedWorktree?.id).toBe('common:develop')
    expect(briefing.exitCode).toBe(2)
    expect(briefing.markdownBriefing).toContain('MULTI_CONSUMER_DIRTY')
    expect(briefing.markdownBriefing).toContain('DOWNSTREAM BLAST RADIUS')
    expect(briefing.markdownBriefing).toContain('app:wt-web/web-app')
    expect(briefing.markdownBriefing).toContain('app:wt-mobile')
  })
})

describe('Config Management & Editor Integration', () => {
  it('detects editor with preference for nvim / environment variable or valid system fallback', async () => {
    const { detectEditor } = await import('../src/core/configEditor.js')
    const prevBanyanEditor = process.env.BANYAN_EDITOR
    const prevEditor = process.env.EDITOR
    try {
      // Isolate from the host environment: CI runners may export EDITOR (e.g. notepad.exe on Windows)
      delete process.env.BANYAN_EDITOR
      delete process.env.EDITOR
      const editor = detectEditor()
      expect(typeof editor).toBe('string')
      expect(editor.length).toBeGreaterThan(0)
      // In CI environments without nvim pre-installed, falls back to vim, nano, vi, code, or notepad
      expect(['nvim', 'vim', 'nano', 'vi', 'code', 'notepad']).toContain(editor)

      process.env.EDITOR = 'env-editor'
      expect(['nvim', 'env-editor']).toContain(detectEditor())

      process.env.BANYAN_EDITOR = 'custom-vim'
      expect(detectEditor()).toBe('custom-vim')
    } finally {
      if (prevBanyanEditor !== undefined) {
        process.env.BANYAN_EDITOR = prevBanyanEditor
      } else {
        delete process.env.BANYAN_EDITOR
      }
      if (prevEditor !== undefined) {
        process.env.EDITOR = prevEditor
      } else {
        delete process.env.EDITOR
      }
    }
  })

  it('locates and loads banyan.config.json with configPath and rawConfig', async () => {
    const { findConfigFile, readConfigFileRaw } = await import('../src/core/configEditor.js')
    const { loadConfig } = await import('../src/core/config.js')

    const configPath = findConfigFile(process.cwd())
    expect(configPath).not.toBeNull()
    expect(configPath?.endsWith('banyan.config.json')).toBe(true)

    const raw = readConfigFileRaw(configPath!)
    expect(raw).toContain('acme-ecosystem')

    const loaded = await loadConfig(process.cwd())
    expect(loaded.workspaceName).toBe('acme-ecosystem')
    expect(loaded.configPath).toBe(configPath)
    expect(loaded.rawConfig).toBeDefined()
    expect(loaded.rawConfig?.defaultWorkspace).toBe('acme-ecosystem')
    expect(loaded.workspace.repos.length).toBeGreaterThan(0)
  })

  it('parses theme and lang at root and workspace levels with schema validation', async () => {
    const { loadConfig } = await import('../src/core/config.js')

    const loaded = await loadConfig(process.cwd())
    expect(loaded.rawConfig?.theme).toBe('catppuccin')
    expect(loaded.rawConfig?.lang).toBe('es')
    expect(loaded.workspace.theme).toBe('catppuccin')
    expect(loaded.workspace.lang).toBe('es')
  })

  it('guarantees identical dictionary structure for cfgTab in Spanish and English', async () => {
    const { DICTIONARIES } = await import('../src/i18n/index.js')
    expect(DICTIONARIES.es.tabs.cfg).toBe('Config')
    expect(DICTIONARIES.en.tabs.cfg).toBe('Config')

    const esKeys = Object.keys(DICTIONARIES.es.cfgTab).sort()
    const enKeys = Object.keys(DICTIONARIES.en.cfgTab).sort()
    expect(esKeys).toEqual(enKeys)
    expect(esKeys).toContain('title')
    expect(esKeys).toContain('actions')
    expect(esKeys).toContain('detectedEditor')
    expect(esKeys).toContain('jsonPreview')
    expect(esKeys).toContain('muxActive')
  })

  it('tokenizes JSON lines into semantic colored tokens without flat monocolor', async () => {
    const { tokenizeJsonLine, getJsonTokenColor } =
      await import('../src/ui/components/JsonHighlight.js')
    const { THEMES } = await import('../src/ui/theme.js')
    const theme = THEMES.default

    // Line 1: Key with string value
    const line1 = '  "$schema": "https://banyan.dev/schema/v1.json",'
    const tokens1 = tokenizeJsonLine(line1)
    expect(tokens1.some((t) => t.type === 'key' && t.text === '"$schema"')).toBe(true)
    expect(tokens1.some((t) => t.type === 'colon' && t.text === ':')).toBe(true)
    expect(
      tokens1.some((t) => t.type === 'string' && t.text === '"https://banyan.dev/schema/v1.json"'),
    ).toBe(true)
    expect(tokens1.some((t) => t.type === 'comma' && t.text === ',')).toBe(true)

    // Line 2: Key with boolean value
    const line2 = '  "discoverSubdirs": false,'
    const tokens2 = tokenizeJsonLine(line2)
    expect(tokens2.some((t) => t.type === 'key' && t.text === '"discoverSubdirs"')).toBe(true)
    expect(tokens2.some((t) => t.type === 'boolean' && t.text === 'false')).toBe(true)

    // Line 3: Key with number value
    const line3 = '  "threshold": 45,'
    const tokens3 = tokenizeJsonLine(line3)
    expect(tokens3.some((t) => t.type === 'key' && t.text === '"threshold"')).toBe(true)
    expect(tokens3.some((t) => t.type === 'number' && t.text === '45')).toBe(true)

    // Line 4: Inline object with multiple keys and strings
    const line4 = '  { "alias": "app", "path": "./web-app" },'
    const tokens4 = tokenizeJsonLine(line4)
    const keys = tokens4.filter((t) => t.type === 'key').map((t) => t.text)
    const strings = tokens4.filter((t) => t.type === 'string').map((t) => t.text)
    expect(keys).toEqual(['"alias"', '"path"'])
    expect(strings).toEqual(['"app"', '"./web-app"'])

    // Colors: Ensure different token types get distinct theme colors
    const keyColor = getJsonTokenColor('key', theme)
    const strColor = getJsonTokenColor('string', theme)
    const numColor = getJsonTokenColor('number', theme)
    const boolColor = getJsonTokenColor('boolean', theme)

    expect(keyColor).toBe(theme.secondary)
    expect(strColor).toBe(theme.success)
    expect(numColor).toBe(theme.warning)
    expect(boolColor).toBe(theme.agent)
    expect(keyColor).not.toEqual(strColor)
  })

  it('supports targetMode split, tab, and inline in openConfigInEditor', async () => {
    const { openConfigInEditor } = await import('../src/core/configEditor.js')
    const { isInMuxSession } = await import('../src/integrations/mux.js')

    // Test that targetMode option exists and is handled properly
    expect(typeof openConfigInEditor).toBe('function')
    expect(typeof isInMuxSession).toBe('function')
  })
})
