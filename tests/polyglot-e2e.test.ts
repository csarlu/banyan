import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { buildEcosystemSnapshot } from '../src/core/orchestrator.js'
import { generateAgentBriefing } from '../src/core/agentBriefing.js'
import {
  createDirLink,
  setupPolyglotPlayground,
  PolyglotPlayground,
} from '../src/core/playground.js'
import { WorkspaceConfig } from '../src/core/types.js'

const execFileAsync = promisify(execFile)

async function runGitCmd(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, windowsHide: true })
  return stdout
}

async function createTestGitRepo(
  sandboxDir: string,
  dirName: string,
  files: Record<string, string>,
  branch = 'main',
): Promise<string> {
  const repoDir = path.join(sandboxDir, dirName)
  await fs.mkdir(repoDir, { recursive: true })
  await runGitCmd(repoDir, ['init', '-b', branch])
  await runGitCmd(repoDir, ['config', 'user.email', 'test@banyan.dev'])
  await runGitCmd(repoDir, ['config', 'user.name', 'Banyan E2E'])

  for (const [relPath, content] of Object.entries(files)) {
    const full = path.join(repoDir, relPath)
    await fs.mkdir(path.dirname(full), { recursive: true })
    await fs.writeFile(full, content, 'utf-8')
  }

  await runGitCmd(repoDir, ['add', '.'])
  await runGitCmd(repoDir, ['commit', '-m', `init ${dirName}`])
  return repoDir
}

describe('Polyglot E2E Suite A: Python Raw & Editable Filesystem Matrix', () => {
  let sandboxDir = ''
  let wsConfig: WorkspaceConfig

  beforeAll(async () => {
    sandboxDir = await fs.mkdtemp(path.join(os.tmpdir(), 'banyan-py-e2e-'))

    // 1. py-core on main + sibling worktree on feat-x
    const pyCore = await createTestGitRepo(
      sandboxDir,
      'py-core',
      {
        'pyproject.toml': '[project]\nname = "py-core"\nversion = "0.1.0"\n',
        'src/py_core/__init__.py': 'def core_fn(): return 1\n',
      },
      'main',
    )
    const pyCoreFeatX = path.join(sandboxDir, 'py-core-feat-x')
    await runGitCmd(pyCore, ['worktree', 'add', '-b', 'feat-x', pyCoreFeatX])

    // 2. py-consumer on feat-x testing:
    //    - source-symlink (src/core_symlink -> ../py-core/src)
    //    - .env PYTHONPATH
    //    - .vscode/settings.json extraPaths
    //    - .pth file in .venv/Lib/site-packages
    //    - .egg-link in .venv/Lib/site-packages
    const pyConsumer = await createTestGitRepo(
      sandboxDir,
      'py-consumer',
      {
        'pyproject.toml': '[project]\nname = "py-consumer"\nversion = "0.1.0"\n',
        '.env': 'PYTHONPATH="../py-core/src"\n',
        '.vscode/settings.json': JSON.stringify({
          'python.analysis.extraPaths': ['../py-core/src'],
        }),
        '.venv/Lib/site-packages/py_core.pth': '../py-core/src\n',
        '.venv/Lib/site-packages/py_core.egg-link': '../py-core/src\n',
        'main.py': 'import py_core\n',
      },
      'feat-x',
    )

    // Create raw source directory junction
    await createDirLink(path.join(pyCore, 'src'), path.join(pyConsumer, 'src', 'core_symlink'))

    // 3. py-consumer-worker sibling worktree sharing .venv junction with active Claude agent
    const pyConsumerWorker = path.join(sandboxDir, 'py-consumer-worker')
    await runGitCmd(pyConsumer, ['worktree', 'add', '-b', 'feat-x-worker', pyConsumerWorker])
    await createDirLink(path.join(pyConsumer, '.venv'), path.join(pyConsumerWorker, '.venv'))
    // Write active agent lock
    await fs.writeFile(path.join(pyConsumerWorker, '.claude.lock'), 'active', 'utf-8')

    wsConfig = {
      root: sandboxDir,
      discoverSubdirs: true,
      repos: [
        { alias: 'py-core', path: pyCore },
        { alias: 'py-consumer', path: pyConsumer },
      ],
      adapters: { python: { enabled: true }, raw: { enabled: true } },
    }
  })

  afterAll(async () => {
    if (sandboxDir) await fs.rm(sandboxDir, { recursive: true, force: true })
  })

  it('scans Python raw source symlinks, .env, .vscode, .pth, .egg-link, and triggers SHARED_ENV_DIRTY', async () => {
    const snapshot = await buildEcosystemSnapshot('python-suite', wsConfig)

    // Worktrees: py-core (main), py-core-feat-x (feat-x), py-consumer (feat-x), py-consumer-worker (feat-x-worker)
    expect(snapshot.worktrees.length).toBe(4)

    const mechanisms = snapshot.junctions.map((j) => j.mechanism)
    expect(mechanisms).toContain('source-symlink')
    expect(mechanisms).toContain('pythonpath-override')
    expect(mechanisms).toContain('pip-editable')

    // Verify SHARED_ENV_DIRTY is triggered between py-consumer and py-consumer-worker
    const sharedEnvWarn = snapshot.warnings.find((w) => w.type === 'SHARED_ENV_DIRTY')
    expect(sharedEnvWarn).toBeDefined()
    expect(sharedEnvWarn?.message).toContain('.venv')

    // Verify agent briefing reports Python-specific guardrail
    const consumerWorkerWt = snapshot.worktrees.find((w) =>
      w.relPath.includes('py-consumer-worker'),
    )
    expect(consumerWorkerWt).toBeDefined()
    const briefing = generateAgentBriefing(snapshot, consumerWorkerWt!.worktreePath)
    expect(briefing.markdownBriefing).toContain('DO NOT run `pip install` or `uv add`')
    const briefingEs = generateAgentBriefing(snapshot, consumerWorkerWt!.worktreePath, 'es')
    expect(briefingEs.markdownBriefing).toContain('PROHIBIDO ejecutar `pip install` o `uv add`')
  })
})

describe('Polyglot E2E Suite B: Go go.mod, go.work & Broken Link Recovery', () => {
  let sandboxDir = ''
  let wsConfig: WorkspaceConfig
  let goSvcDir = ''

  beforeAll(async () => {
    sandboxDir = await fs.mkdtemp(path.join(os.tmpdir(), 'banyan-go-e2e-'))

    // 1. go-lib on main + sibling on feat-v2
    const goLib = await createTestGitRepo(
      sandboxDir,
      'go-lib',
      {
        'go.mod': 'module github.com/acme/golib\ngo 1.22\n',
        'lib.go': 'package golib\n',
      },
      'main',
    )
    const goLibV2 = path.join(sandboxDir, 'go-lib-feat-v2')
    await runGitCmd(goLib, ['worktree', 'add', '-b', 'feat-v2', goLibV2])

    // 2. go-svc on feat-v2 pointing to main (triggers BRANCH_MISMATCH) and a deleted worktree (BROKEN_LINK)
    goSvcDir = await createTestGitRepo(
      sandboxDir,
      'go-svc',
      {
        'go.mod':
          [
            'module github.com/acme/gosvc',
            'go 1.22',
            'replace (',
            '  github.com/acme/golib => ../go-lib',
            '  github.com/acme/nonexistent => ../deleted-worktree-path',
            ')',
          ].join('\n') + '\n',
        'go.work': ['go 1.22', 'use (', '  .', '  ../go-lib', ')'].join('\n') + '\n',
        'main.go': 'package main\nfunc main() {}\n',
      },
      'feat-v2',
    )

    wsConfig = {
      root: sandboxDir,
      discoverSubdirs: true,
      repos: [
        { alias: 'go-lib', path: goLib },
        { alias: 'go-svc', path: goSvcDir },
      ],
      adapters: { go: { enabled: true } },
    }
  })

  afterAll(async () => {
    if (sandboxDir) await fs.rm(sandboxDir, { recursive: true, force: true })
  })

  it('detects go.work uses, go.mod block replace, BROKEN_LINK, and BRANCH_MISMATCH', async () => {
    const snapshot = await buildEcosystemSnapshot('go-suite', wsConfig)

    // Verify broken link detection
    const broken = snapshot.warnings.find((w) => w.type === 'BROKEN_LINK')
    expect(broken).toBeDefined()
    expect(broken?.message).toContain('nonexistent')

    // Verify go.work use links
    const goWorkLink = snapshot.junctions.find((j) => j.manifestFile === 'go.work')
    expect(goWorkLink).toBeDefined()

    // Verify BRANCH_MISMATCH and suggested fix command
    const mismatch = snapshot.warnings.find((w) => w.type === 'BRANCH_MISMATCH')
    expect(mismatch).toBeDefined()
    expect(mismatch?.suggestedFixCommand).toContain('go mod edit -replace=github.com/acme/golib=')
    expect(mismatch?.suggestedFixCommand).toContain('go-lib-feat-v2')
  })
})

describe('Polyglot E2E Suite C: Rust Cargo, .cargo/config.toml & Shared target/', () => {
  let sandboxDir = ''
  let wsConfig: WorkspaceConfig
  let rustAppDir = ''

  beforeAll(async () => {
    sandboxDir = await fs.mkdtemp(path.join(os.tmpdir(), 'banyan-rust-e2e-'))

    // 1. rust-lib on main + sibling on feat-simd
    const rustLib = await createTestGitRepo(
      sandboxDir,
      'rust-lib',
      {
        'Cargo.toml': '[package]\nname = "rust-lib"\nversion = "0.1.0"\n',
        'src/lib.rs': 'pub fn compute() {}\n',
      },
      'main',
    )
    const rustLibSimd = path.join(sandboxDir, 'rust-lib-feat-simd')
    await runGitCmd(rustLib, ['worktree', 'add', '-b', 'feat-simd', rustLibSimd])

    // 2. rust-app on feat-simd with inline, section, and .cargo/config.toml paths
    rustAppDir = await createTestGitRepo(
      sandboxDir,
      'rust-app',
      {
        'Cargo.toml':
          [
            '[package]',
            'name = "rust-app"',
            'version = "0.1.0"',
            '[dependencies]',
            'rust-lib = { path = "../rust-lib" }',
            '[dependencies.rust-lib-sec]',
            'path = "../rust-lib"',
          ].join('\n') + '\n',
        '.cargo/config.toml': 'paths = ["../rust-lib"]\n',
        'target/marker.txt': 'cache-marker\n',
      },
      'feat-simd',
    )

    // 3. Sibling rust-app-worker sharing target/ junction with active Aider agent
    const rustAppWorker = path.join(sandboxDir, 'rust-app-worker')
    await runGitCmd(rustAppDir, ['worktree', 'add', '-b', 'feat-simd-worker', rustAppWorker])
    await createDirLink(path.join(rustAppDir, 'target'), path.join(rustAppWorker, 'target'))
    await fs.writeFile(
      path.join(rustAppWorker, '.aider.chat.history.md'),
      '# active aider\n',
      'utf-8',
    )

    wsConfig = {
      root: sandboxDir,
      discoverSubdirs: true,
      repos: [
        { alias: 'rust-lib', path: rustLib },
        { alias: 'rust-app', path: rustAppDir },
      ],
      adapters: { rust: { enabled: true } },
    }
  })

  afterAll(async () => {
    if (sandboxDir) await fs.rm(sandboxDir, { recursive: true, force: true })
  })

  it('scans Rust inline & section deps, .cargo/config.toml, shared target/, and briefings', async () => {
    const snapshot = await buildEcosystemSnapshot('rust-suite', wsConfig)

    const rustLinks = snapshot.junctions.filter((j) => j.ecosystem === 'rust')
    expect(rustLinks.length).toBeGreaterThanOrEqual(2)

    // SHARED_ENV_DIRTY for target/
    const sharedWarn = snapshot.warnings.find((w) => w.type === 'SHARED_ENV_DIRTY')
    expect(sharedWarn).toBeDefined()
    expect(sharedWarn?.message).toContain('target')

    // Agent briefing guardrails
    const workerWt = snapshot.worktrees.find((w) => w.relPath.includes('rust-app-worker'))
    expect(workerWt).toBeDefined()
    const briefing = generateAgentBriefing(snapshot, workerWt!.worktreePath)
    expect(briefing.markdownBriefing).toContain('CAUTION: Folder `target/` shared')
    const briefingEs = generateAgentBriefing(snapshot, workerWt!.worktreePath, 'es')
    expect(briefingEs.markdownBriefing).toContain('CUIDADO: Carpeta `target/` compartida')
  })
})

describe('Polyglot E2E Suite D: .NET Nested .csproj & ProjectReference Resolution', () => {
  let sandboxDir = ''
  let wsConfig: WorkspaceConfig

  beforeAll(async () => {
    sandboxDir = await fs.mkdtemp(path.join(os.tmpdir(), 'banyan-dotnet-e2e-'))

    // 1. dotnet-lib on main + sibling on feat-v3
    const dotnetLib = await createTestGitRepo(
      sandboxDir,
      'dotnet-lib',
      {
        'Lib.sln': 'Microsoft Visual Studio Solution File, Format Version 12.00\n',
        'src/Core/Core.csproj': '<Project Sdk="Microsoft.NET.Sdk"></Project>\n',
      },
      'main',
    )
    const dotnetLibV3 = path.join(sandboxDir, 'dotnet-lib-feat-v3')
    await runGitCmd(dotnetLib, ['worktree', 'add', '-b', 'feat-v3', dotnetLibV3])

    // 2. dotnet-service with nested src/Api/Api.csproj relative reference: ..\..\..\dotnet-lib\src\Core\Core.csproj
    const dotnetSvc = await createTestGitRepo(
      sandboxDir,
      'dotnet-service',
      {
        'Service.sln': 'Microsoft Visual Studio Solution File, Format Version 12.00\n',
        'src/Api/Api.csproj':
          [
            '<Project Sdk="Microsoft.NET.Sdk">',
            '  <ItemGroup>',
            '    <ProjectReference Include="..\\..\\..\\dotnet-lib\\src\\Core\\Core.csproj" />',
            '  </ItemGroup>',
            '</Project>',
          ].join('\n') + '\n',
        'obj/assets.json': '{}\n',
      },
      'feat-v3',
    )

    // 3. dotnet-service-worker sharing obj/ junction with dotnet-service
    const dotnetSvcWorker = path.join(sandboxDir, 'dotnet-service-worker')
    await runGitCmd(dotnetSvc, ['worktree', 'add', '-b', 'feat-v3-worker', dotnetSvcWorker])
    await createDirLink(path.join(dotnetSvc, 'obj'), path.join(dotnetSvcWorker, 'obj'))

    wsConfig = {
      root: sandboxDir,
      discoverSubdirs: true,
      repos: [
        { alias: 'dotnet-lib', path: dotnetLib },
        { alias: 'dotnet-service', path: dotnetSvc },
      ],
      adapters: { dotnet: { enabled: true } },
    }
  })

  afterAll(async () => {
    if (sandboxDir) await fs.rm(sandboxDir, { recursive: true, force: true })
  })

  it('resolves relative <ProjectReference> from nested subdirectories and detects BRANCH_MISMATCH', async () => {
    const snapshot = await buildEcosystemSnapshot('dotnet-suite', wsConfig)

    const dotnetLink = snapshot.junctions.find((j) => j.ecosystem === 'dotnet')
    expect(dotnetLink).toBeDefined()
    expect(dotnetLink?.packageName).toBe('Core')
    expect(dotnetLink?.targetWorktreeId).toContain('dotnet-lib:')

    // BRANCH_MISMATCH detection
    const mismatch = snapshot.warnings.find((w) => w.type === 'BRANCH_MISMATCH')
    expect(mismatch).toBeDefined()
    expect(mismatch?.suggestedFixCommand).toContain('dotnet remove')
    expect(mismatch?.suggestedFixCommand).toContain('dotnet add')
    expect(mismatch?.suggestedFixCommand).toContain('dotnet-lib-feat-v3')
  })
})

describe('Polyglot E2E Suite E: Closed-Loop Auto-Fix Verification Across Adapters', () => {
  let sandboxDir = ''
  let wsConfig: WorkspaceConfig
  let goSvcDir = ''
  let pyTraderDir = ''
  let goLibV2Dir = ''

  beforeAll(async () => {
    sandboxDir = await fs.mkdtemp(path.join(os.tmpdir(), 'banyan-fix-loop-'))

    // Go repos with mismatch
    const goLib = await createTestGitRepo(
      sandboxDir,
      'go-lib',
      { 'go.mod': 'module acme/golib\n' },
      'main',
    )
    goLibV2Dir = path.join(sandboxDir, 'go-lib-feat-fix')
    await runGitCmd(goLib, ['worktree', 'add', '-b', 'feat-fix', goLibV2Dir])

    goSvcDir = await createTestGitRepo(
      sandboxDir,
      'go-svc',
      {
        'go.mod': 'module acme/gosvc\ngo 1.22\nreplace acme/golib => ../go-lib\n',
      },
      'feat-fix',
    )

    // Python repos with mismatch in .env
    const pyCore = await createTestGitRepo(
      sandboxDir,
      'py-core',
      { 'pyproject.toml': '[project]\nname="py-core"\n' },
      'main',
    )
    const pyCoreFix = path.join(sandboxDir, 'py-core-feat-fix')
    await runGitCmd(pyCore, ['worktree', 'add', '-b', 'feat-fix', pyCoreFix])

    pyTraderDir = await createTestGitRepo(
      sandboxDir,
      'py-trader',
      {
        'pyproject.toml': '[project]\nname="py-trader"\n',
        '.env': 'PYTHONPATH="../py-core"\n',
      },
      'feat-fix',
    )

    wsConfig = {
      root: sandboxDir,
      discoverSubdirs: true,
      repos: [
        { alias: 'go-lib', path: goLib },
        { alias: 'go-svc', path: goSvcDir },
        { alias: 'py-core', path: pyCore },
        { alias: 'py-trader', path: pyTraderDir },
      ],
      adapters: { go: { enabled: true }, python: { enabled: true } },
    }
  })

  afterAll(async () => {
    if (sandboxDir) await fs.rm(sandboxDir, { recursive: true, force: true })
  })

  it('verifies that applying fixes eliminates the corresponding collision warnings', async () => {
    // 1. Initial snapshot has 2 BRANCH_MISMATCH collisions (Go + Python)
    const initialSnap = await buildEcosystemSnapshot('fix-verify', wsConfig)
    const goMismatch = initialSnap.warnings.find(
      (w) =>
        w.type === 'BRANCH_MISMATCH' && w.affectedWorktreeIds.some((id) => id.includes('go-svc')),
    )
    expect(goMismatch).toBeDefined()

    const pyMismatch = initialSnap.warnings.find(
      (w) =>
        w.type === 'BRANCH_MISMATCH' &&
        w.affectedWorktreeIds.some((id) => id.includes('py-trader')),
    )
    expect(pyMismatch).toBeDefined()

    // 2. Closed-loop fix for Go: update replace to point to sibling go-lib-feat-fix
    const goModPath = path.join(goSvcDir, 'go.mod')
    const currentGoMod = await fs.readFile(goModPath, 'utf-8')
    const fixedGoMod = currentGoMod.replace('../go-lib', '../go-lib-feat-fix')
    await fs.writeFile(goModPath, fixedGoMod, 'utf-8')

    // 3. Closed-loop fix for Python: update .env to point to py-core-feat-fix
    const envPath = path.join(pyTraderDir, '.env')
    await fs.writeFile(envPath, 'PYTHONPATH="../py-core-feat-fix"\n', 'utf-8')

    // 4. Re-scan and prove warnings disappeared!
    const reSnapshot = await buildEcosystemSnapshot('fix-verify', wsConfig)
    const reGoMismatch = reSnapshot.warnings.find(
      (w) =>
        w.type === 'BRANCH_MISMATCH' && w.affectedWorktreeIds.some((id) => id.includes('go-svc')),
    )
    expect(reGoMismatch).toBeUndefined()

    const rePyMismatch = reSnapshot.warnings.find(
      (w) =>
        w.type === 'BRANCH_MISMATCH' &&
        w.affectedWorktreeIds.some((id) => id.includes('py-trader')),
    )
    expect(rePyMismatch).toBeUndefined()
  })
})

describe('Polyglot Playground (bny --playground)', () => {
  let playground: PolyglotPlayground | null = null

  afterAll(async () => {
    if (playground) {
      await playground.cleanup()
    }
  })

  it('scaffolds a complete 5-ecosystem playground on disk with config, README, and worktrees', async () => {
    playground = await setupPolyglotPlayground()

    expect(await fs.stat(playground.playgroundDir)).toBeDefined()
    expect(await fs.stat(playground.configPath)).toBeDefined()

    const readme = await fs.readFile(path.join(playground.playgroundDir, 'README.md'), 'utf-8')
    expect(readme).toContain('Banyan Polyglot Playground')
    expect(readme).toContain('Node')
    expect(readme).toContain('Python')
    expect(readme).toContain('Go')
    expect(readme).toContain('Rust')
    expect(readme).toContain('.NET')

    // Build snapshot against playground directory
    const snapshot = await buildEcosystemSnapshot(
      playground.workspaceName,
      playground.workspaceConfig,
    )

    // 10 repos defined + worktrees = at least 15 worktrees
    expect(snapshot.worktrees.length).toBeGreaterThanOrEqual(15)

    // All 5 language ecosystems detected
    const allEcosystems = new Set(snapshot.worktrees.flatMap((w) => w.detectedEcosystems || []))
    expect(allEcosystems.has('node')).toBe(true)
    expect(allEcosystems.has('python')).toBe(true)
    expect(allEcosystems.has('go')).toBe(true)
    expect(allEcosystems.has('rust')).toBe(true)
    expect(allEcosystems.has('dotnet')).toBe(true)

    // All collision warning types present for interactive testing & demo
    const warningTypes = new Set(snapshot.warnings.map((w) => w.type))
    expect(warningTypes.has('BRANCH_MISMATCH')).toBe(true)
    expect(warningTypes.has('BROKEN_LINK')).toBe(true)
    expect(warningTypes.has('SHARED_ENV_DIRTY')).toBe(true)
  })
})
