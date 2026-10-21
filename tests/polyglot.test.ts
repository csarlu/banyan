import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { parseGoModReplaces, parseGoWorkUses } from '../src/core/adapters/goAdapter.js'
import { parseCargoTomlPaths } from '../src/core/adapters/rustAdapter.js'
import { parseCsprojReferences } from '../src/core/adapters/dotnetAdapter.js'
import {
  parsePythonDirectUrl,
  parsePythonPth,
  parsePythonSysPath,
  parseEnvPythonPath,
} from '../src/core/adapters/pythonAdapter.js'
import { parseTsConfigPaths } from '../src/core/adapters/rawSourceAdapter.js'
import { detectCollisions } from '../src/core/collisions.js'
import { buildEcosystemSnapshot } from '../src/core/orchestrator.js'
import { generateAgentBriefing } from '../src/core/agentBriefing.js'
import { JunctionLink, WorkspaceConfig, WorktreeNode } from '../src/core/types.js'

const execFileAsync = promisify(execFile)

async function runGitCmd(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd, windowsHide: true })
}

describe('Polyglot Manifest & Raw Source Parsers (Unit)', () => {
  it('parses go.mod single-line and block replace directives accurately', () => {
    const goMod = `
      module github.com/acme/auth-svc
      go 1.22

      // Single line replace
      replace github.com/org/lib => ../lib-wt

      replace (
        github.com/org/core v1.0.0 => ../core-wt
        github.com/org/remote v1.0.0 => github.com/org/fork v1.0.1
      )
    `
    const parsed = parseGoModReplaces(goMod)
    expect(parsed).toEqual([
      { moduleName: 'github.com/org/lib', targetPath: '../lib-wt' },
      { moduleName: 'github.com/org/core', targetPath: '../core-wt' },
    ])
  })

  it('parses go.work use directives', () => {
    const goWork = `
      go 1.22
      use ./local-cmd
      use (
        .
        ../shared-go-wt
      )
    `
    const parsed = parseGoWorkUses(goWork)
    expect(parsed).toContain('./local-cmd')
    expect(parsed).toContain('../shared-go-wt')
    expect(parsed).not.toContain('.')
  })

  it('parses Cargo.toml inline path dependencies, table sections, and .cargo/config.toml paths', () => {
    const cargoToml = `
      [package]
      name = "engine"
      version = "0.1.0"

      [dependencies]
      my-crate = { version = "0.2.0", path = "../lib-wt", features = ["serde"] }
      serde = "1.0"

      [dependencies.math-core]
      path = "../math-core-wt"
    `
    const parsed = parseCargoTomlPaths(cargoToml)
    expect(parsed).toEqual([
      { crateName: 'my-crate', targetPath: '../lib-wt' },
      { crateName: 'math-core', targetPath: '../math-core-wt' },
    ])

    const cargoConfig = `
      paths = ["../override-crate-a", "../override-crate-b"]
    `
    const parsedConfig = parseCargoTomlPaths(cargoConfig)
    expect(parsedConfig).toEqual([
      { crateName: 'override-crate-a', targetPath: '../override-crate-a' },
      { crateName: 'override-crate-b', targetPath: '../override-crate-b' },
    ])
  })

  it('parses .NET .csproj <ProjectReference Include="..."/> tags', () => {
    const csproj = `
      <Project Sdk="Microsoft.NET.Sdk">
        <ItemGroup>
          <ProjectReference Include="..\\..\\lib-wt\\Lib.csproj" />
          <ProjectReference Include="../common-wt/Acme.Common.csproj" />
        </ItemGroup>
      </Project>
    `
    const parsed = parseCsprojReferences(csproj)
    expect(parsed).toEqual([
      { projectName: 'Lib', includePath: '..\\..\\lib-wt\\Lib.csproj' },
      { projectName: 'Acme.Common', includePath: '../common-wt/Acme.Common.csproj' },
    ])
  })

  it('parses Python PEP 610 direct_url.json, .pth files, PYTHONPATH, and sys.path.append', () => {
    const directUrlJson = JSON.stringify({
      url: 'file:///C:/projects/quant-lib-wt',
      dir_info: { editable: true },
    })
    const parsedDirect = parsePythonDirectUrl(directUrlJson, 'quant_lib-0.1.0.dist-info')
    expect(parsedDirect).not.toBeNull()
    expect(parsedDirect?.packageName).toBe('quant_lib')
    expect(parsedDirect?.targetPath.replace(/\\/g, '/')).toContain('/projects/quant-lib-wt')

    const pthContent = `
      # Editable install path
      ../strategies-wt/src
    `
    const parsedPth = parsePythonPth(pthContent, '__editable__.strategies-0.1.0.pth')
    expect(parsedPth).toEqual([{ packageName: 'strategies', targetPath: '../strategies-wt/src' }])

    const pyCode = `
      import sys, os
      sys.path.append("../estrategias-wt")
      sys.path.insert(0, os.path.abspath('../indicadores-wt'))
    `
    expect(parsePythonSysPath(pyCode)).toEqual(['../estrategias-wt', '../indicadores-wt'])

    const envFile = `
      DEBUG=true
      PYTHONPATH="../estrategias-wt;../risk-engine-wt"
    `
    expect(parseEnvPythonPath(envFile)).toEqual(['../estrategias-wt', '../risk-engine-wt'])
  })

  it('parses tsconfig.json compilerOptions.paths with JSONC comments', () => {
    const tsconfig = `
      {
        // JSON with comments
        "compilerOptions": {
          "baseUrl": ".",
          "paths": {
            "@acme/ui/*": ["../shared-ui-wt/src/*"],
            "@internal/*": ["./src/internal/*"]
          }
        }
      }
    `
    const parsed = parseTsConfigPaths(tsconfig)
    expect(parsed).toEqual([
      { alias: '@acme/ui', targetPath: '../shared-ui-wt/src' },
      { alias: '@internal', targetPath: './src/internal' },
    ])
  })
})

describe('Polyglot Collision Engine & Suggested Fix Commands', () => {
  it('detects BRANCH_MISMATCH in Go and generates exact go mod edit -replace command', () => {
    const wts: WorktreeNode[] = [
      {
        id: 'auth:auth-feat-x',
        relPath: 'auth-feat-x',
        repoAlias: 'auth',
        repoPath: '/p/auth',
        worktreePath: '/p/auth-feat-x',
        branch: 'feat-x',
        headSha: 'aaa1111',
        isBare: false,
        dirtyCount: 0,
        ahead: 0,
        behind: 0,
        recentCommits: [],
        nodeModulesType: 'none',
        detectedEcosystems: ['go'],
        agentStatus: { isActive: false },
      },
      {
        id: 'lib:lib-main',
        relPath: 'lib-main',
        repoAlias: 'lib',
        repoPath: '/p/lib',
        worktreePath: '/p/lib-main',
        branch: 'main',
        headSha: 'bbb2222',
        isBare: false,
        dirtyCount: 0,
        ahead: 0,
        behind: 0,
        recentCommits: [],
        nodeModulesType: 'none',
        detectedEcosystems: ['go'],
        agentStatus: { isActive: false },
      },
      {
        id: 'lib:lib-feat-x',
        relPath: 'lib-feat-x',
        repoAlias: 'lib',
        repoPath: '/p/lib',
        worktreePath: '/p/lib-feat-x',
        branch: 'feat-x',
        headSha: 'ccc3333',
        isBare: false,
        dirtyCount: 0,
        ahead: 0,
        behind: 0,
        recentCommits: [],
        nodeModulesType: 'none',
        detectedEcosystems: ['go'],
        agentStatus: { isActive: false },
      },
    ]

    const links: JunctionLink[] = [
      {
        sourceWorktreeId: 'auth:auth-feat-x',
        sourceWorktreePath: '/p/auth-feat-x',
        packageName: 'github.com/org/lib',
        linkPath: '/p/auth-feat-x/go.mod',
        targetRealPath: '/p/lib-main',
        targetWorktreeId: 'lib:lib-main',
        targetRepoAlias: 'lib',
        targetBranch: 'main',
        isBroken: false,
        isHighlightedScope: true,
        ecosystem: 'go',
        mechanism: 'go-mod-replace',
        manifestFile: 'go.mod',
      },
    ]

    const warnings = detectCollisions(wts, links)
    const mismatch = warnings.find((w) => w.type === 'BRANCH_MISMATCH')
    expect(mismatch).toBeDefined()
    expect(mismatch?.suggestedFixCommand).toBe(
      'go mod edit -replace=github.com/org/lib=/p/lib-feat-x',
    )
  })

  it('detects SHARED_ENV_DIRTY when two worktrees share a .venv or target/ with active agents', () => {
    const wts: WorktreeNode[] = [
      {
        id: 'bot:main',
        relPath: 'bot-main',
        repoAlias: 'bot',
        repoPath: '/p/bot',
        worktreePath: '/p/bot-main',
        branch: 'main',
        headSha: '111',
        isBare: false,
        dirtyCount: 1,
        ahead: 0,
        behind: 0,
        recentCommits: [],
        nodeModulesType: 'none',
        detectedEcosystems: ['python'],
        sharedEnvs: [{ ecosystem: 'python', envName: '.venv', type: 'own' }],
        agentStatus: { isActive: true, reason: 'lockfile', detail: '.claude' },
      },
      {
        id: 'bot:wt-feat',
        relPath: 'bot-wt-feat',
        repoAlias: 'bot',
        repoPath: '/p/bot',
        worktreePath: '/p/bot-wt-feat',
        branch: 'feat-ai',
        headSha: '222',
        isBare: false,
        dirtyCount: 0,
        ahead: 0,
        behind: 0,
        recentCommits: [],
        nodeModulesType: 'none',
        detectedEcosystems: ['python'],
        sharedEnvs: [
          {
            ecosystem: 'python',
            envName: '.venv',
            type: 'shared',
            targetRealPath: '/p/bot-main/.venv',
            targetWorktreeId: 'bot:main',
          },
        ],
        agentStatus: { isActive: true, reason: 'lockfile', detail: '.aider' },
      },
    ]

    const warnings = detectCollisions(wts, [])
    const sharedWarn = warnings.find((w) => w.type === 'SHARED_ENV_DIRTY')
    expect(sharedWarn).toBeDefined()
    expect(sharedWarn?.severity).toBe('critical')
    expect(sharedWarn?.affectedWorktreeIds).toContain('bot:wt-feat')
    expect(sharedWarn?.affectedWorktreeIds).toContain('bot:main')
  })
})

describe('Polyglot Sandbox Integration Test (Real Git Worktrees on Disk)', () => {
  let sandboxDir = ''

  beforeAll(async () => {
    sandboxDir = await fs.mkdtemp(path.join(os.tmpdir(), 'banyan-polyglot-sandbox-'))

    // Helper to init a real git repo with main branch and optional worktree
    async function createGitRepo(
      dirName: string,
      files: Record<string, string>,
      branch = 'main',
    ): Promise<string> {
      const repoDir = path.join(sandboxDir, dirName)
      await fs.mkdir(repoDir, { recursive: true })
      await runGitCmd(repoDir, ['init', '-b', branch])
      await runGitCmd(repoDir, ['config', 'user.email', 'test@banyan.dev'])
      await runGitCmd(repoDir, ['config', 'user.name', 'Banyan Test'])

      for (const [relFile, content] of Object.entries(files)) {
        const full = path.join(repoDir, relFile)
        await fs.mkdir(path.dirname(full), { recursive: true })
        await fs.writeFile(full, content, 'utf-8')
      }

      await runGitCmd(repoDir, ['add', '.'])
      await runGitCmd(repoDir, ['commit', '-m', 'initial commit'])
      return repoDir
    }

    // 1. Go Library Repo (main) + sibling worktree (feat-x)
    const goLibMain = await createGitRepo('go-lib', {
      'go.mod': 'module github.com/acme/golib\ngo 1.22\n',
      'lib.go': 'package golib\n',
    })
    const goLibFeatX = path.join(sandboxDir, 'go-lib-feat-x')
    await runGitCmd(goLibMain, ['worktree', 'add', '-b', 'feat-x', goLibFeatX])

    // 2. Go Service Repo on branch feat-x pointing to ../go-lib (main) -> triggers BRANCH_MISMATCH!
    await createGitRepo(
      'go-service',
      {
        'go.mod': [
          'module github.com/acme/goservice',
          'go 1.22',
          'replace github.com/acme/golib => ../go-lib',
        ].join('\n'),
        'main.go': 'package main\n',
      },
      'feat-x',
    )

    // 3. Python Strategy Module (dirty worktree)
    const pyStratDir = await createGitRepo('py-strategies', {
      'strategies.py': 'def run(): pass\n',
    })
    // Make py-strategies dirty (uncommitted modification)
    await fs.writeFile(
      path.join(pyStratDir, 'strategies.py'),
      'def run(): return "dirty-change"\n',
      'utf-8',
    )

    // 4. Python Bot #1 (Raw sys.path.append + .env PYTHONPATH without pip/venv)
    await createGitRepo('py-bot-raw', {
      'main.py': 'import sys\nsys.path.append("../py-strategies")\nimport strategies\n',
    })

    // 5. Python Bot #2 (PEP 610 .venv editable install pointing to py-strategies)
    const stratFileUrl = `file:///${pyStratDir.replace(/\\/g, '/')}`
    await createGitRepo('py-bot-venv', {
      'pyproject.toml': '[project]\nname = "py-bot-venv"\n',
      '.venv/Lib/site-packages/py_strategies-0.1.0.dist-info/direct_url.json': JSON.stringify({
        url: stratFileUrl,
        dir_info: { editable: true },
      }),
    })

    // 6. Rust Engine + .NET Service + TypeScript paths (Hybrid Polyglot Repo)
    await createGitRepo('poly-consumer', {
      'Cargo.toml':
        '[package]\nname = "engine"\n[dependencies]\ngolib-rs = { path = "../go-lib" }\n',
      'App.csproj':
        '<Project Sdk="Microsoft.NET.Sdk"><ItemGroup><ProjectReference Include="../go-lib/Lib.csproj" /></ItemGroup></Project>',
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@strategies/*': ['../py-strategies/*'],
          },
        },
      }),
    })
  })

  afterAll(async () => {
    if (sandboxDir) {
      await fs.rm(sandboxDir, { recursive: true, force: true })
    }
  })

  it('scans all polyglot ecosystems, detects raw & manifest links, and computes collisions accurately', async () => {
    const wsConfig: WorkspaceConfig = {
      root: sandboxDir,
      discoverSubdirs: true,
      repos: [
        { alias: 'go-lib', path: path.join(sandboxDir, 'go-lib') },
        { alias: 'go-service', path: path.join(sandboxDir, 'go-service') },
        { alias: 'py-strategies', path: path.join(sandboxDir, 'py-strategies') },
        { alias: 'py-bot-raw', path: path.join(sandboxDir, 'py-bot-raw') },
        { alias: 'py-bot-venv', path: path.join(sandboxDir, 'py-bot-venv') },
        { alias: 'poly-consumer', path: path.join(sandboxDir, 'poly-consumer') },
      ],
    }

    const snapshot = await buildEcosystemSnapshot('polyglot-sandbox', wsConfig)

    // 6 repos + 1 git worktree (go-lib-feat-x) = 7 worktrees total
    expect(snapshot.worktrees.length).toBe(7)

    // Verify ecosystem detection on worktrees
    const goSvcWt = snapshot.worktrees.find((w) => w.repoAlias === 'go-service')
    expect(goSvcWt?.detectedEcosystems).toContain('go')

    const pyBotRawWt = snapshot.worktrees.find((w) => w.repoAlias === 'py-bot-raw')
    expect(pyBotRawWt?.detectedEcosystems).toContain('python')

    const polyWt = snapshot.worktrees.find((w) => w.repoAlias === 'poly-consumer')
    expect(polyWt?.detectedEcosystems).toEqual(expect.arrayContaining(['rust', 'dotnet']))

    // Verify discovered links across mechanisms
    const mechanisms = snapshot.junctions.map((j) => j.mechanism)
    expect(mechanisms).toContain('go-mod-replace')
    expect(mechanisms).toContain('pythonpath-override')
    expect(mechanisms).toContain('pip-editable')
    expect(mechanisms).toContain('cargo-path')
    expect(mechanisms).toContain('dotnet-projref')
    expect(mechanisms).toContain('tsconfig-path')

    // Verify Go BRANCH_MISMATCH collision & suggested fix command
    const goMismatch = snapshot.warnings.find(
      (w) => w.type === 'BRANCH_MISMATCH' && w.affectedWorktreeIds.includes(goSvcWt!.id),
    )
    expect(goMismatch).toBeDefined()
    expect(goMismatch?.suggestedFixCommand).toContain('go mod edit -replace=github.com/acme/golib=')
    expect(goMismatch?.suggestedFixCommand).toContain('go-lib-feat-x')

    // Verify Python MULTI_CONSUMER_DIRTY collision (py-bot-raw + py-bot-venv + poly-consumer consuming dirty py-strategies)
    const pyStratWt = snapshot.worktrees.find((w) => w.repoAlias === 'py-strategies')
    const multiDirty = snapshot.warnings.find(
      (w) => w.type === 'MULTI_CONSUMER_DIRTY' && w.affectedWorktreeIds.includes(pyStratWt!.id),
    )
    expect(multiDirty).toBeDefined()
    expect(multiDirty?.severity).toBe('critical')

    // Verify Agent Briefing on go-service reports Go ecosystem and exitCode 3
    const briefing = generateAgentBriefing(snapshot, goSvcWt!.worktreePath)
    expect(briefing.exitCode).toBe(3)
    expect(briefing.markdownBriefing).toContain('go-mod-replace')
    expect(briefing.markdownBriefing).toContain('go mod edit -replace=')
  })
})

describe('Open Source Readiness (--init-shell & Auto-Scope Discovery)', () => {
  it('generates valid PowerShell and Bash/Zsh wrapper scripts for bny --init-shell', async () => {
    const { generateShellInitScript } = await import('../src/cli.js')
    const pwsh = generateShellInitScript('powershell')
    expect(pwsh).toContain('function bny')
    expect(pwsh).toContain('Set-Location $target')

    const bash = generateShellInitScript('bash')
    expect(bash).toContain('bny()')
    expect(bash).toContain('cd "$target"')
  })
})

describe('Ecosystem Icons & Visual Reference Badges', () => {
  it('maps each ecosystem to its designated vim-devicon glyph and branding color', async () => {
    const { getEcosystemIcon, getEcosystemColor, getEcosystemBadgeLabel, getMechanismLabel } =
      await import('../src/core/adapters/index.js')

    expect(getEcosystemIcon('go')).toBe('\ue627') // 
    expect(getEcosystemIcon('rust')).toBe('\ue7a8') // 
    expect(getEcosystemIcon('python')).toBe('\ue606') // 
    expect(getEcosystemIcon('node')).toBe('\ue718') // 
    expect(getEcosystemIcon('dotnet')).toBe('\ue77f') // 
    expect(getEcosystemIcon('raw')).toBe('\ue612') // 

    expect(getEcosystemColor('go')).toBe('#00ADD8')
    expect(getEcosystemColor('rust')).toBe('#DEA584')
    expect(getEcosystemColor('python')).toBe('#3572A5')
    expect(getEcosystemColor('node')).toBe('#68A063')
    expect(getEcosystemColor('dotnet')).toBe('#A174F8')
    expect(getEcosystemColor('raw')).toBe('#8A9099')

    expect(getEcosystemBadgeLabel('go')).toBe('\ue627 Go')
    expect(getEcosystemBadgeLabel('rust')).toBe('\ue7a8 Rust')
    expect(getEcosystemBadgeLabel('python')).toBe('\ue606 Py')
    expect(getEcosystemBadgeLabel('node')).toBe('\ue718 Node')
    expect(getEcosystemBadgeLabel('dotnet')).toBe('\ue77f .NET')
    expect(getEcosystemBadgeLabel('raw')).toBe('\ue612 Raw')

    expect(getEcosystemBadgeLabel('go', false)).toBe('Go')

    expect(getMechanismLabel('go-mod-replace')).toBe('go.mod replace')
    expect(getMechanismLabel('cargo-path')).toBe('cargo path')
    expect(getMechanismLabel('pip-editable')).toBe('pip -e')
    expect(getMechanismLabel('dotnet-projref')).toBe('ProjectReference')
    expect(getMechanismLabel('fs-junction')).toBe('junction')
    expect(getMechanismLabel('tsconfig-path')).toBe('tsconfig path')
  })

  it('normalizes technology at repo level when homogeneous and differentiates when heterogeneous', async () => {
    const { computeRepoEcosystemMap } = await import('../src/core/adapters/index.js')

    const sampleWorktrees: WorktreeNode[] = [
      // Homogeneous repo (all Go)
      {
        id: 'go-api:main',
        relPath: 'go-api',
        repoAlias: 'go-api',
        repoPath: '/p/go-api',
        worktreePath: '/p/go-api',
        branch: 'main',
        headSha: '111',
        isBare: false,
        dirtyCount: 0,
        ahead: 0,
        behind: 0,
        recentCommits: [],
        nodeModulesType: 'none',
        agentStatus: { isActive: false },
        detectedEcosystems: ['go'],
      },
      {
        id: 'go-api:feat-auth',
        relPath: 'feat-auth',
        repoAlias: 'go-api',
        repoPath: '/p/go-api',
        worktreePath: '/p/feat-auth',
        branch: 'feat-auth',
        headSha: '222',
        isBare: false,
        dirtyCount: 0,
        ahead: 0,
        behind: 0,
        recentCommits: [],
        nodeModulesType: 'none',
        agentStatus: { isActive: false },
        detectedEcosystems: ['go'],
      },
      // Heterogeneous repo (different branches with different stacks)
      {
        id: 'poly-svc:main',
        relPath: 'poly-svc',
        repoAlias: 'poly-svc',
        repoPath: '/p/poly-svc',
        worktreePath: '/p/poly-svc',
        branch: 'main',
        headSha: '333',
        isBare: false,
        dirtyCount: 0,
        ahead: 0,
        behind: 0,
        recentCommits: [],
        nodeModulesType: 'none',
        agentStatus: { isActive: false },
        detectedEcosystems: ['node'],
      },
      {
        id: 'poly-svc:rust-rewrite',
        relPath: 'rust-rewrite',
        repoAlias: 'poly-svc',
        repoPath: '/p/poly-svc',
        worktreePath: '/p/rust-rewrite',
        branch: 'rust-rewrite',
        headSha: '444',
        isBare: false,
        dirtyCount: 0,
        ahead: 0,
        behind: 0,
        recentCommits: [],
        nodeModulesType: 'none',
        agentStatus: { isActive: false },
        detectedEcosystems: ['rust'],
      },
    ]

    const map = computeRepoEcosystemMap(sampleWorktrees)

    const goApi = map.get('go-api')
    expect(goApi).toBeDefined()
    expect(goApi?.isHomogeneous).toBe(true)
    expect(goApi?.ecosystems).toEqual(['go'])
    expect(goApi?.icons).toEqual(['\ue627'])

    const polySvc = map.get('poly-svc')
    expect(polySvc).toBeDefined()
    expect(polySvc?.isHomogeneous).toBe(false)
    expect(polySvc?.ecosystems).toEqual(expect.arrayContaining(['node', 'rust']))
    expect(polySvc?.icons).toEqual(expect.arrayContaining(['\ue718', '\ue7a8']))
  })

  it('enforces exact pre-allocated cell widths while preserving 1-cell Nerd Font / Lucide glyphs', async () => {
    const { fitCell, formatBracketedName, sanitizeSingleWidth, wrapCellLines } =
      await import('../src/ui/utils/formatters.js')

    // Strips surrogate emojis and FE0F variation selectors while preserving 1-cell BMP Nerd Font icons
    const cleaned = sanitizeSingleWidth('🐍 \ue627 \uf487 repo-name')
    expect(cleaned).toBe(' \ue627 \uf487 repo-name')

    // fitCell guarantees exact length whether input is shorter or longer
    const padded = fitCell('main', 12, 'left')
    expect(padded).toBe('main        ')
    expect(padded.length).toBe(12)

    const truncated = fitCell('feature/super-long-branch-name-v2', 12, 'left')
    expect(truncated).toBe('feature/su..')
    expect(truncated.length).toBe(12)

    // formatBracketedName trims inside [...] and pads to exact slot width
    const bracketShort = formatBracketedName('\ue627 api', 14)
    expect(bracketShort).toBe('[\ue627 api]       ')
    expect(bracketShort.length).toBe(14)

    const bracketLong = formatBracketedName('\ue627 enterprise-payment-gateway-service', 14)
    expect(bracketLong).toBe('[\ue627 enterpri..]')
    expect(bracketLong.length).toBe(14)

    // wrapCellLines splits long paths into exact-width lines for Shift+K mode
    const wrapped = wrapCellLines(
      '/Users/dev/projects/enterprise-monorepo/worktree-feat-auth',
      24,
      2,
      3,
    )
    expect(wrapped.length).toBeGreaterThan(1)
    for (const line of wrapped) {
      expect(line.length).toBe(24)
    }
  })
})
