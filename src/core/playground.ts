import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { WorkspaceConfig } from './types.js'
import type { Locale } from '../i18n/index.js'

const execFileAsync = promisify(execFile)

export async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    windowsHide: true,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Banyan Playground',
      GIT_AUTHOR_EMAIL: 'playground@banyan.dev',
      GIT_COMMITTER_NAME: 'Banyan Playground',
      GIT_COMMITTER_EMAIL: 'playground@banyan.dev',
    },
  })
  return stdout
}

export async function createDirLink(targetDir: string, linkPath: string): Promise<void> {
  await fs.mkdir(path.dirname(linkPath), { recursive: true })
  try {
    await fs.rm(linkPath, { recursive: true, force: true })
  } catch {
    // Ignore
  }
  const type = process.platform === 'win32' ? 'junction' : 'dir'
  await fs.symlink(targetDir, linkPath, type)
}

export interface PolyglotPlayground {
  playgroundDir: string
  configPath: string
  workspaceName: string
  workspaceConfig: WorkspaceConfig
  cleanup: () => Promise<void>
}

/**
 * Creates an exhaustive polyglot git ecosystem on disk containing:
 * - Node: npm workspaces / node_modules junctions with scoped package and branch mismatch
 * - Python: .env PYTHONPATH, .vscode extraPaths, .pth, .egg-link, raw source-symlink, shared .venv junction
 * - Go: go.mod replace (branch mismatch + broken replace), go.work multi-module uses
 * - Rust: Cargo.toml inline & section dependencies, .cargo/config.toml paths, shared target/ junction with active agent
 * - .NET: Solution .sln at root, nested src/Api/Api.csproj relative project references, shared obj/ junction
 */
export async function setupPolyglotPlayground(
  customRoot?: string,
  locale: Locale = 'en',
): Promise<PolyglotPlayground> {
  const playgroundDir = customRoot
    ? path.resolve(customRoot)
    : await fs.mkdtemp(path.join(os.tmpdir(), 'banyan-polyglot-playground-'))

  await fs.mkdir(playgroundDir, { recursive: true })

  const REPO_HISTORY_TEMPLATES: Record<
    string,
    {
      branchName: string
      branchCommit: string
      mainCommit: string
      mergeMsg: string
      latestCommit: string
    }
  > = {
    'node-ui-lib': {
      branchName: 'feat/tokens-v2',
      branchCommit: 'feat(tokens): add semantic dark-mode palette variables',
      mainCommit: 'fix(button): prevent focus ring clipping on high-DPI screens',
      mergeMsg: "Merge branch 'feat/tokens-v2' into main",
      latestCommit: 'perf(bundle): tree-shake unused radix primitives',
    },
    'node-web-app': {
      branchName: 'feat/ssr-streaming',
      branchCommit: 'feat(ssr): enable streaming suspense boundaries for dashboard',
      mainCommit: 'fix(auth): refresh session cookie before hydration',
      mergeMsg: "Merge branch 'feat/ssr-streaming' into feat-dark",
      latestCommit: 'refactor(layout): wire @banyan/ui dark theme provider',
    },
    'py-ml-core': {
      branchName: 'feat/quantized-weights',
      branchCommit: 'feat(inference): add INT8 dynamic quantization kernel',
      mainCommit: 'fix(tensor): guard against NaN gradients in batch norm',
      mergeMsg: "Merge branch 'feat/quantized-weights' into main",
      latestCommit: 'perf(cuda): pre-allocate pinned memory pool for inference',
    },
    'py-trader': {
      branchName: 'feat/orderbook-l3',
      branchCommit: 'feat(feed): subscribe to L3 websocket orderbook snapshots',
      mainCommit: 'fix(risk): enforce max drawdown circuit breaker per symbol',
      mergeMsg: "Merge branch 'feat/orderbook-l3' into feat-opt",
      latestCommit: 'chore(env): link local ml-core editable pipeline',
    },
    'go-common-lib': {
      branchName: 'feat/otel-tracing',
      branchCommit: 'feat(telemetry): propagate W3C traceparent across gRPC interceptors',
      mainCommit: 'fix(retry): add jittered exponential backoff on 503 responses',
      mergeMsg: "Merge branch 'feat/otel-tracing' into main",
      latestCommit: 'refactor(pool): zero-allocation byte buffer recycling',
    },
    'go-gateway': {
      branchName: 'feat/rate-limiter',
      branchCommit: 'feat(middleware): token-bucket distributed rate limiter',
      mainCommit: 'fix(proxy): drain upstream HTTP/2 connections on SIGTERM',
      mergeMsg: "Merge branch 'feat/rate-limiter' into main",
      latestCommit: 'feat(router): mount v2 gRPC-gateway multiplex handler',
    },
    'rust-compute-core': {
      branchName: 'feat/avx512-kernels',
      branchCommit: 'feat(simd): implement AVX-512 f32 dot-product intrinsic',
      mainCommit: 'fix(arena): align bump allocator slabs to 64-byte cache lines',
      mergeMsg: "Merge branch 'feat/avx512-kernels' into main",
      latestCommit: 'perf(rayon): tune work-stealing thread pool chunk size',
    },
    'rust-service': {
      branchName: 'feat/zero-copy-ipc',
      branchCommit: 'feat(ipc): shared-memory ring buffer for worker telemetry',
      mainCommit: 'fix(tokio): prevent task starvation under bursty RPC load',
      mergeMsg: "Merge branch 'feat/zero-copy-ipc' into feat-simd",
      latestCommit: 'refactor(engine): bind local rust-compute-core crate path',
    },
    'dotnet-shared-lib': {
      branchName: 'feat/source-generators',
      branchCommit: 'feat(codegen): incremental System.Text.Json source generator',
      mainCommit: 'fix(di): validate scoped lifetime registrations at startup',
      mergeMsg: "Merge branch 'feat/source-generators' into main",
      latestCommit: 'perf(span): replace string allocations with ReadOnlySpan<char>',
    },
    'dotnet-billing-api': {
      branchName: 'feat/stripe-webhooks',
      branchCommit: 'feat(webhooks): idempotent ledger ingestion with outbox pattern',
      mainCommit: 'fix(invoice): round multi-currency VAT using MidpointRounding.ToEven',
      mergeMsg: "Merge branch 'feat/stripe-webhooks' into feat-async",
      latestCommit: 'refactor(api): reference local SharedLib Core.csproj',
    },
  }

  async function createRepo(
    dirName: string,
    files: Record<string, string>,
    branch = 'main',
  ): Promise<string> {
    const repoDir = path.join(playgroundDir, dirName)
    await fs.mkdir(repoDir, { recursive: true })
    await runGit(repoDir, ['init', '-b', branch])

    for (const [relPath, content] of Object.entries(files)) {
      const full = path.join(repoDir, relPath)
      await fs.mkdir(path.dirname(full), { recursive: true })
      await fs.writeFile(full, content, 'utf-8')
    }

    await runGit(repoDir, ['add', '.'])
    await runGit(repoDir, ['commit', '-m', `chore(init): bootstrap ${dirName} (${branch})`])

    // Seed realistic branched git history so the TUI Git Graph displays rich topology
    const tpl = REPO_HISTORY_TEMPLATES[dirName]
    if (tpl) {
      await runGit(repoDir, ['checkout', '-b', tpl.branchName])
      await runGit(repoDir, ['commit', '--allow-empty', '-m', tpl.branchCommit])
      await runGit(repoDir, ['checkout', branch])
      await runGit(repoDir, ['commit', '--allow-empty', '-m', tpl.mainCommit])
      await runGit(repoDir, ['merge', '--no-ff', tpl.branchName, '-m', tpl.mergeMsg])
      await runGit(repoDir, ['branch', '-d', tpl.branchName])
      await runGit(repoDir, ['commit', '--allow-empty', '-m', tpl.latestCommit])
    }

    return repoDir
  }

  // Run all 5 ecosystem setups concurrently for fast scaffolding
  await Promise.all([
    // 1. NODE ECOSYSTEM
    (async () => {
      const nodeUiLib = await createRepo(
        'node-ui-lib',
        {
          'package.json': JSON.stringify(
            {
              name: '@banyan/ui',
              version: '1.0.0',
              main: 'index.js',
            },
            null,
            2,
          ),
          'index.js': 'module.exports = { Button: () => "button" };\n',
        },
        'main',
      )
      const nodeUiLibDark = path.join(playgroundDir, 'node-ui-lib-feat-dark')
      await runGit(nodeUiLib, ['worktree', 'add', '-b', 'feat-dark', nodeUiLibDark])
      await runGit(nodeUiLibDark, [
        'commit',
        '--allow-empty',
        '-m',
        'feat(theme): add OLED high-contrast surface tokens',
      ])

      const nodeWebApp = await createRepo(
        'node-web-app',
        {
          'package.json': JSON.stringify(
            {
              name: 'node-web-app',
              version: '0.1.0',
              dependencies: { '@banyan/ui': '^1.0.0' },
            },
            null,
            2,
          ),
          'src/app.js': 'const { Button } = require("@banyan/ui");\n',
        },
        'feat-dark',
      )
      // Junction pointing to node-ui-lib (main) -> BRANCH_MISMATCH because node-web-app is feat-dark and node-ui-lib-feat-dark exists!
      await createDirLink(nodeUiLib, path.join(nodeWebApp, 'node_modules', '@banyan', 'ui'))
    })(),

    // 2. PYTHON ECOSYSTEM
    (async () => {
      const pyMlCore = await createRepo(
        'py-ml-core',
        {
          'pyproject.toml': '[project]\nname = "ml-core"\nversion = "0.1.0"\n',
          'src/ml_core/__init__.py': 'def predict(): return 42\n',
        },
        'main',
      )
      const pyMlCoreOpt = path.join(playgroundDir, 'py-ml-core-feat-opt')
      await runGit(pyMlCore, ['worktree', 'add', '-b', 'feat-opt', pyMlCoreOpt])

      const pyTrader = await createRepo(
        'py-trader',
        {
          'pyproject.toml': '[project]\nname = "py-trader"\nversion = "0.1.0"\n',
          'main.py': 'import ml_core\nprint(ml_core.predict())\n',
          // (a) .env PYTHONPATH pointing to sibling worktree on main (triggers BRANCH_MISMATCH)
          '.env': 'PYTHONPATH="../py-ml-core/src"\nDEBUG=1\n',
          // (b) .vscode extraPaths
          '.vscode/settings.json': JSON.stringify(
            { 'python.analysis.extraPaths': ['../py-ml-core/src'] },
            null,
            2,
          ),
          // (c) .venv with .pth and .egg-link
          '.venv/Lib/site-packages/ml_core.pth': '../py-ml-core/src\n',
          '.venv/Lib/site-packages/ml_core.egg-link': '../py-ml-core/src\n',
        },
        'feat-opt',
      )

      // (d) Raw source symlink / junction
      await createDirLink(path.join(pyMlCore, 'src'), path.join(pyTrader, 'src', 'ml_core_link'))

      // (e) Sibling worktree sharing .venv junction (triggers SHARED_ENV_DIRTY when active agent present)
      const pyTraderWorker = path.join(playgroundDir, 'py-trader-worker')
      await runGit(pyTrader, ['worktree', 'add', '-b', 'feat-opt-worker', pyTraderWorker])
      // Share .venv via junction
      await createDirLink(path.join(pyTrader, '.venv'), path.join(pyTraderWorker, '.venv'))
      // Simulate active Claude agent lockfile in py-trader-worker
      await fs.writeFile(path.join(pyTraderWorker, '.claude.lock'), 'agent-active\n', 'utf-8')
    })(),

    // 3. GO ECOSYSTEM
    (async () => {
      const goCommonLib = await createRepo(
        'go-common-lib',
        {
          'go.mod': 'module github.com/banyan/common\ngo 1.22\n',
          'common.go': 'package common\nconst Version = "v1"\n',
        },
        'main',
      )
      const goCommonLibV2 = path.join(playgroundDir, 'go-common-lib-feat-v2')
      await runGit(goCommonLib, ['worktree', 'add', '-b', 'feat-v2', goCommonLibV2])

      const goGateway = await createRepo(
        'go-gateway',
        {
          'go.mod':
            [
              'module github.com/banyan/gateway',
              'go 1.22',
              'replace github.com/banyan/common => ../go-common-lib',
            ].join('\n') + '\n',
          'go.work': ['go 1.22', 'use (', '  .', '  ../go-common-lib', ')'].join('\n') + '\n',
          'main.go':
            'package main\n\nimport "github.com/banyan/common"\n\nfunc main() {\n\t_ = common.Version\n}\n',
        },
        'main',
      )
      const goGatewayV2 = path.join(playgroundDir, 'go-gateway-feat-v2')
      await runGit(goGateway, ['worktree', 'add', '-b', 'feat-v2', goGatewayV2])

      // In go-gateway-feat-v2: block replace with branch mismatch + broken link
      const goModV2Path = path.join(goGatewayV2, 'go.mod')
      await fs.writeFile(
        goModV2Path,
        [
          'module github.com/banyan/gateway',
          'go 1.22',
          'replace (',
          '  github.com/banyan/common => ../go-common-lib',
          '  github.com/banyan/stale-mock => ../deleted-mock-wt',
          ')',
        ].join('\n') + '\n',
        'utf-8',
      )
      const twoMinAgo = new Date(Date.now() - 120_000)
      await fs.utimes(goModV2Path, twoMinAgo, twoMinAgo)
    })(),

    // 4. RUST ECOSYSTEM
    (async () => {
      const rustComputeCore = await createRepo(
        'rust-compute-core',
        {
          'Cargo.toml':
            '[package]\nname = "rust-compute-core"\nversion = "0.1.0"\nedition = "2021"\n',
          'src/lib.rs': 'pub fn compute() -> i32 { 100 }\n',
        },
        'main',
      )
      const rustComputeSimd = path.join(playgroundDir, 'rust-compute-core-feat-simd')
      await runGit(rustComputeCore, ['worktree', 'add', '-b', 'feat-simd', rustComputeSimd])

      const rustService = await createRepo(
        'rust-service',
        {
          // (a) Cargo.toml inline & section path deps
          'Cargo.toml':
            [
              '[package]',
              'name = "rust-service"',
              'version = "0.1.0"',
              'edition = "2021"',
              '',
              '[dependencies]',
              'compute-core = { path = "../rust-compute-core" }',
              '',
              '[dependencies.compute-sec]',
              'path = "../rust-compute-core"',
            ].join('\n') + '\n',
          // (b) .cargo/config.toml
          '.cargo/config.toml': 'paths = ["../rust-compute-core"]\n',
          'src/main.rs': 'fn main() {}\n',
          'target/CACHEDIR.TAG': 'Signature: 8a477f597d28d172789f06886806bc55\n',
        },
        'feat-simd',
      )

      // (c) Sibling worktree sharing target/ junction with active Aider agent lock
      const rustServiceWorker = path.join(playgroundDir, 'rust-service-worker')
      await runGit(rustService, ['worktree', 'add', '-b', 'feat-simd-worker', rustServiceWorker])
      await createDirLink(path.join(rustService, 'target'), path.join(rustServiceWorker, 'target'))
      await fs.writeFile(
        path.join(rustServiceWorker, '.aider.chat.history.md'),
        '# Aider active session\n',
        'utf-8',
      )
    })(),

    // 5. .NET ECOSYSTEM
    (async () => {
      const dotnetSharedLib = await createRepo(
        'dotnet-shared-lib',
        {
          'SharedLib.sln': 'Microsoft Visual Studio Solution File, Format Version 12.00\n',
          'src/Core/Core.csproj':
            '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>\n',
          'src/Core/Core.cs': 'namespace Core { public class Engine {} }\n',
        },
        'main',
      )
      const dotnetSharedAsync = path.join(playgroundDir, 'dotnet-shared-lib-feat-async')
      await runGit(dotnetSharedLib, ['worktree', 'add', '-b', 'feat-async', dotnetSharedAsync])

      const dotnetBillingApi = await createRepo(
        'dotnet-billing-api',
        {
          'BillingApi.sln': 'Microsoft Visual Studio Solution File, Format Version 12.00\n',
          // Relative reference from nested src/Api/ to sibling worktree: ..\..\..\dotnet-shared-lib\src\Core\Core.csproj
          'src/Api/Api.csproj':
            [
              '<Project Sdk="Microsoft.NET.Sdk">',
              '  <PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup>',
              '  <ItemGroup>',
              '    <ProjectReference Include="..\\..\\..\\dotnet-shared-lib\\src\\Core\\Core.csproj" />',
              '  </ItemGroup>',
              '</Project>',
            ].join('\n') + '\n',
          'src/Api/Program.cs': 'class Program { static void Main() {} }\n',
          'obj/project.assets.json': '{ "version": 3 }\n',
        },
        'feat-async',
      )

      // Sibling worktree sharing obj/ junction
      const dotnetBillingWorker = path.join(playgroundDir, 'dotnet-billing-worker')
      await runGit(dotnetBillingApi, [
        'worktree',
        'add',
        '-b',
        'feat-async-worker',
        dotnetBillingWorker,
      ])
      await createDirLink(path.join(dotnetBillingApi, 'obj'), path.join(dotnetBillingWorker, 'obj'))
    })(),
  ])

  // 6. GENERATE BANYAN CONFIG
  const workspaceConfig: WorkspaceConfig = {
    root: playgroundDir,
    discoverSubdirs: true,
    repos: [
      { alias: 'node-ui-lib', path: path.join(playgroundDir, 'node-ui-lib') },
      { alias: 'node-web-app', path: path.join(playgroundDir, 'node-web-app') },
      { alias: 'py-ml-core', path: path.join(playgroundDir, 'py-ml-core') },
      { alias: 'py-trader', path: path.join(playgroundDir, 'py-trader') },
      { alias: 'go-common-lib', path: path.join(playgroundDir, 'go-common-lib') },
      { alias: 'go-gateway', path: path.join(playgroundDir, 'go-gateway') },
      { alias: 'rust-compute-core', path: path.join(playgroundDir, 'rust-compute-core') },
      { alias: 'rust-service', path: path.join(playgroundDir, 'rust-service') },
      { alias: 'dotnet-shared-lib', path: path.join(playgroundDir, 'dotnet-shared-lib') },
      { alias: 'dotnet-billing-api', path: path.join(playgroundDir, 'dotnet-billing-api') },
    ],
    adapters: {
      node: { enabled: true, highlightScopes: ['@banyan'] },
      python: { enabled: true },
      go: { enabled: true },
      rust: { enabled: true },
      dotnet: { enabled: true },
      raw: { enabled: true },
    },
  }

  const banyanConfig = {
    defaultWorkspace: 'polyglot-playground',
    workspaces: {
      'polyglot-playground': {
        root: '.',
        discoverSubdirs: true,
        repos: workspaceConfig.repos.map((r) => ({
          alias: r.alias,
          path: `./${path.basename(r.path)}`,
        })),
        adapters: workspaceConfig.adapters,
      },
    },
  }

  const configPath = path.join(playgroundDir, 'banyan.config.json')
  await fs.writeFile(configPath, JSON.stringify(banyanConfig, null, 2), 'utf-8')

  // 7. PLAYGROUND README
  // 7. PLAYGROUND README
  const readmeContent = playgroundReadme(locale)
  await fs.writeFile(path.join(playgroundDir, 'README.md'), readmeContent, 'utf-8')

  return {
    playgroundDir,
    configPath,
    workspaceName: 'polyglot-playground',
    workspaceConfig,
    cleanup: async () => {
      await fs.rm(playgroundDir, { recursive: true, force: true })
    },
  }
}

export async function cleanupPlayground(playgroundDir: string): Promise<void> {
  if (playgroundDir) {
    await fs.rm(playgroundDir, { recursive: true, force: true })
  }
}

function playgroundReadme(locale: Locale): string {
  if (locale === 'es') {
    return `# 🌳 Banyan Polyglot Playground

Bienvenido al playground políglota interactivo de Banyan.

## 📦 Ecosistemas y Repositorios Incluidos
- **Node:** \`node-ui-lib\` (@banyan/ui) + \`node-web-app\` (enlace de dependencias local con ramas cruzadas)
- **Python:** \`py-ml-core\` + \`py-trader\` (.env PYTHONPATH, .vscode extraPaths, .pth, .egg-link, y .venv compartido con un agente activo)
- **Go:** \`go-common-lib\` + \`go-gateway\` (go.mod replace con ramas desalineadas + replace roto + go.work)
- **Rust:** \`rust-compute-core\` + \`rust-service\` (Cargo.toml deps por ruta inline y sección, .cargo/config.toml, y target/ compartido con agente activo)
- **.NET:** \`dotnet-shared-lib\` + \`dotnet-billing-api\` (solución .sln en raíz con .csproj anidado y obj/ compartido)

## 🎮 Comandos TUI Recomendados
- Pulsa **[1]** para inspeccionar worktrees y sus badges de ecosistema (Node, Py, Go, Rust, .NET).
- Pulsa **[2]** para ver todos los enlaces descubiertos (symlinks, junctions, reemplazos, .pth, etc.).
- Pulsa **[3]** para revisar alertas de colisión y pulsa **[f]** para auto-repararlas en vivo.
- Pulsa **[e]** para abrir el modal explicativo pedagógico.
- Pulsa **[q]** para salir.
`
  }
  return `# 🌳 Banyan Polyglot Playground

Welcome to Banyan's interactive polyglot playground.

## 📦 Included Ecosystems and Repositories
- **Node:** \`node-ui-lib\` (@banyan/ui) + \`node-web-app\` (local dependency link with crossed branches)
- **Python:** \`py-ml-core\` + \`py-trader\` (.env PYTHONPATH, .vscode extraPaths, .pth, .egg-link, and a .venv shared with an active agent)
- **Go:** \`go-common-lib\` + \`go-gateway\` (go.mod replace with misaligned branches + broken replace + go.work)
- **Rust:** \`rust-compute-core\` + \`rust-service\` (Cargo.toml path deps inline and by section, .cargo/config.toml, and a target/ shared with an active agent)
- **.NET:** \`dotnet-shared-lib\` + \`dotnet-billing-api\` (root .sln with nested .csproj and shared obj/)

## 🎮 Recommended TUI Commands
- Press **[1]** to inspect worktrees and their ecosystem badges (Node, Py, Go, Rust, .NET).
- Press **[2]** to see all discovered links (symlinks, junctions, replaces, .pth, etc.).
- Press **[3]** to review collision alerts and press **[f]** to auto-fix them live.
- Press **[e]** to open the pedagogical explain modal.
- Press **[q]** to quit.`
}
