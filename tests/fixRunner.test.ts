import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { describe, it, expect } from 'vitest'
import { executeFixCommand, splitShellAndChain } from '../src/core/fixRunner.js'
import { copyToClipboard } from '../src/core/clipboard.js'
import { detectCollisions } from '../src/core/collisions.js'
import { buildEcosystemSnapshot } from '../src/core/orchestrator.js'
import { createDirLink } from '../src/core/playground.js'
import { isExecutableFix } from '../src/core/shellSafe.js'
import { pythonAdapter } from '../src/core/adapters/pythonAdapter.js'
import { rustAdapter } from '../src/core/adapters/rustAdapter.js'
import type { JunctionLink, WorkspaceConfig, WorktreeNode } from '../src/core/types.js'

const execFileAsync = promisify(execFile)

async function runGit(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd, windowsHide: true })
}

describe('Auto-Fix Execution & Clipboard Yank (BAN-4 & Issue #18)', () => {
  describe('executeFixCommand', () => {
    it('executes a safe echo command successfully', async () => {
      const isWindows = process.platform === 'win32'
      const cmd = isWindows ? 'Write-Output "banyan-autofix-ok"' : 'echo "banyan-autofix-ok"'
      const res = await executeFixCommand(cmd)

      expect(res.ok).toBe(true)
      expect(res.stdout).toContain('banyan-autofix-ok')
      expect(res.error).toBeUndefined()
    })

    it('captures failures cleanly for invalid commands', async () => {
      const res = await executeFixCommand('non_existent_command_xyz_123')
      expect(res.ok).toBe(false)
      expect(res.error).toBeDefined()
    })

    it('refuses to execute manual comment hints or config snippets as shell commands', async () => {
      expect(isExecutableFix('# Review broken reference')).toBe(false)
      expect(isExecutableFix('# banyan.config.json "repos": {"alias":"ext","path":"/ext"}')).toBe(
        false,
      )
      const res = await executeFixCommand('# Manual hint')
      expect(res.ok).toBe(false)
      expect(res.error).toContain('Manual hint or config snippet')
    })

    it('splits top-level && chains without splitting && inside quoted arguments', () => {
      const parts = splitShellAndChain('echo "a && b" && echo \'c && d\' && echo done')
      expect(parts).toEqual(['echo "a && b"', "echo 'c && d'", 'echo done'])
    })
  })

  describe('Collision Rule Fixes (Issue #18)', () => {
    it('targets the worktree venv interpreter for Python pip install -e and edits .pth / .env in place', () => {
      const targetWt = {
        id: 'lib:feat',
        worktreePath: '/p/py-lib-feat',
      } as unknown as WorktreeNode

      // 1. PEP 610 direct_url.json -> uses worktree .venv python -m pip install -e
      const pipLink: JunctionLink = {
        sourceWorktreeId: 'app:feat',
        sourceWorktreePath: '/p/py-app',
        packageName: 'py_lib',
        linkPath:
          '/p/py-app/.venv/lib/python3.11/site-packages/py_lib-0.1.0.dist-info/direct_url.json',
        targetRealPath: '/p/py-lib',
        isBroken: false,
        isHighlightedScope: true,
        ecosystem: 'python',
        mechanism: 'pip-editable',
        manifestFile: '.venv/lib/python3.11/site-packages/py_lib-0.1.0.dist-info/direct_url.json',
      }
      const pipCmd = pythonAdapter.buildFixCommand(pipLink, targetWt)
      expect(pipCmd).toContain('.venv')
      expect(pipCmd).toContain('-m pip install -e "/p/py-lib-feat"')
      expect(pipCmd.startsWith('pip install')).toBe(false)

      // 2. .pth file -> in-place file replacement
      const pthLink: JunctionLink = {
        sourceWorktreeId: 'app:feat',
        sourceWorktreePath: '/p/py-app',
        packageName: 'py_lib',
        linkPath: '/p/py-app/.venv/lib/python3.11/site-packages/py_lib.pth',
        targetRealPath: '/p/py-lib',
        rawTarget: '../py-lib',
        isBroken: false,
        isHighlightedScope: true,
        ecosystem: 'python',
        mechanism: 'pip-editable',
        manifestFile: '.venv/lib/python3.11/site-packages/py_lib.pth',
      }
      const pthCmd = pythonAdapter.buildFixCommand(pthLink, targetWt)
      expect(isExecutableFix(pthCmd)).toBe(true)
      expect(pthCmd).toContain('../py-lib')
      expect(pthCmd).toContain('../py-lib-feat')

      // 3. .env PYTHONPATH -> in-place file replacement
      const envLink: JunctionLink = {
        sourceWorktreeId: 'app:feat',
        sourceWorktreePath: '/p/py-app',
        packageName: 'py_lib',
        linkPath: '/p/py-app/.env',
        targetRealPath: '/p/py-lib',
        rawTarget: '../py-lib',
        isBroken: false,
        isHighlightedScope: true,
        ecosystem: 'python',
        mechanism: 'pythonpath-override',
        manifestFile: '.env',
      }
      const envCmd = pythonAdapter.buildFixCommand(envLink, targetWt)
      expect(isExecutableFix(envCmd)).toBe(true)
      expect(envCmd).toContain('../py-lib-feat')

      // 4. sys.path.append in .py source file -> remains safe manual hint comment
      const pyCodeLink: JunctionLink = {
        ...envLink,
        linkPath: '/p/py-app/main.py',
        manifestFile: 'main.py',
      }
      const pyCodeCmd = pythonAdapter.buildFixCommand(pyCodeLink, targetWt)
      expect(pyCodeCmd.startsWith('#')).toBe(true)
    })

    it('generates executable Cargo.toml replacement for Rust and falls back to comment on unsafe tokens', () => {
      const targetWt = {
        id: 'lib:feat',
        worktreePath: '/p/rust-lib-feat',
      } as unknown as WorktreeNode

      const safeLink: JunctionLink = {
        sourceWorktreeId: 'app:feat',
        sourceWorktreePath: '/p/rust-app',
        packageName: 'rust-lib',
        linkPath: '/p/rust-app/Cargo.toml',
        targetRealPath: '/p/rust-lib',
        rawTarget: '../rust-lib',
        isBroken: false,
        isHighlightedScope: true,
        ecosystem: 'rust',
        mechanism: 'cargo-path',
        manifestFile: 'Cargo.toml',
      }
      const safeCmd = rustAdapter.buildFixCommand(safeLink, targetWt)
      expect(isExecutableFix(safeCmd)).toBe(true)
      expect(safeCmd).toContain('../rust-lib')
      expect(safeCmd).toContain('../rust-lib-feat')

      const unsafeLink: JunctionLink = {
        ...safeLink,
        rawTarget: '../rust-lib$(id)',
      }
      const unsafeCmd = rustAdapter.buildFixCommand(unsafeLink, targetWt)
      expect(unsafeCmd.startsWith('#')).toBe(true)
    })

    it('generates EXTERNAL_TARGET config snippet and SHARED_ENV_DIRTY unlink+reinstall command', () => {
      const wts: WorktreeNode[] = [
        {
          id: 'app:main',
          relPath: 'app-main',
          repoAlias: 'app',
          repoPath: '/p/app',
          worktreePath: '/p/app-main',
          branch: 'main',
          headSha: '111',
          isBare: false,
          dirtyCount: 1,
          ahead: 0,
          behind: 0,
          recentCommits: [],
          nodeModulesType: 'own',
          detectedEcosystems: ['node'],
          sharedEnvs: [{ ecosystem: 'node', envName: 'node_modules', type: 'own' }],
          agentStatus: { isActive: false },
        },
        {
          id: 'app:feat',
          relPath: 'app-feat',
          repoAlias: 'app',
          repoPath: '/p/app',
          worktreePath: '/p/app-feat',
          branch: 'feat',
          headSha: '222',
          isBare: false,
          dirtyCount: 0,
          ahead: 0,
          behind: 0,
          recentCommits: [],
          nodeModulesType: 'shared',
          detectedEcosystems: ['node'],
          sharedEnvs: [
            {
              ecosystem: 'node',
              envName: 'node_modules',
              type: 'shared',
              targetRealPath: '/p/app-main/node_modules',
              targetWorktreeId: 'app:main',
            },
          ],
          agentStatus: { isActive: true, reason: 'lockfile', detail: '.claude' },
        },
      ]

      const links: JunctionLink[] = [
        {
          sourceWorktreeId: 'app:main',
          sourceWorktreePath: '/p/app-main',
          packageName: '@ext/design-system',
          linkPath: '/p/app-main/node_modules/@ext/design-system',
          targetRealPath: '/opt/external/design-system',
          isBroken: false,
          isHighlightedScope: true,
          ecosystem: 'node',
          mechanism: 'fs-junction',
        },
      ]

      const warnings = detectCollisions(wts, links)

      const sharedWarn = warnings.find((w) => w.type === 'SHARED_ENV_DIRTY')
      expect(sharedWarn).toBeDefined()
      expect(isExecutableFix(sharedWarn?.suggestedFixCommand)).toBe(true)
      expect(sharedWarn?.suggestedFixCommand).toContain('/p/app-feat/node_modules')
      expect(sharedWarn?.suggestedFixCommand).toContain('npm install')

      const externalWarn = warnings.find((w) => w.type === 'EXTERNAL_TARGET')
      expect(externalWarn).toBeDefined()
      expect(externalWarn?.suggestedFixCommand).toContain('banyan.config.json "repos"')
      expect(externalWarn?.suggestedFixCommand).toContain('"alias":"design-system"')
      expect(externalWarn?.suggestedFixCommand).toContain('"/opt/external/design-system"')
      expect(isExecutableFix(externalWarn?.suggestedFixCommand)).toBe(false)
    })

    it('executes MULTI_CONSUMER_DIRTY, Rust Cargo.toml, Python .env/.pth, and SHARED_ENV_DIRTY fixes end-to-end on disk', async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'banyan-issue18-e2e-'))
      try {
        async function initRepo(name: string, files: Record<string, string>, branch = 'main') {
          const dir = path.join(tmpDir, name)
          await fs.mkdir(dir, { recursive: true })
          await runGit(dir, ['init', '-b', branch])
          await runGit(dir, ['config', 'user.email', 'test@banyan.dev'])
          await runGit(dir, ['config', 'user.name', 'Banyan Test'])
          for (const [rel, content] of Object.entries(files)) {
            const full = path.join(dir, rel)
            await fs.mkdir(path.dirname(full), { recursive: true })
            await fs.writeFile(full, content, 'utf-8')
          }
          await runGit(dir, ['add', '.'])
          await runGit(dir, ['commit', '-m', 'init'])
          return dir
        }

        // 1. Shared library on branch 'develop' (with dirty uncommitted file) consumed by 2 Node apps
        const sharedLib = await initRepo(
          'shared-lib',
          { 'package.json': '{"name":"@acme/shared","version":"1.0.0"}\n', 'index.js': '1\n' },
          'develop',
        )
        await fs.writeFile(path.join(sharedLib, 'index.js'), 'dirty-edit\n', 'utf-8')

        const appOne = await initRepo('app-one', {
          'package.json': '{"name":"app-one"}\n',
        })
        const appTwo = await initRepo('app-two', {
          'package.json': '{"name":"app-two"}\n',
        })
        await createDirLink(sharedLib, path.join(appOne, 'node_modules', '@acme', 'shared'))
        await createDirLink(sharedLib, path.join(appTwo, 'node_modules', '@acme', 'shared'))

        // 2. Rust library on 'main' + sibling on 'feat-simd' + Rust consumer on 'feat-simd'
        const rustLib = await initRepo('rust-lib', {
          'Cargo.toml': '[package]\nname = "rust-lib"\nversion = "0.1.0"\n',
        })
        const rustLibFeat = path.join(tmpDir, 'rust-lib-feat-simd')
        await runGit(rustLib, ['worktree', 'add', '-b', 'feat-simd', rustLibFeat])

        const rustConsumer = await initRepo(
          'rust-consumer',
          {
            'Cargo.toml':
              '[package]\nname = "rust-consumer"\n[dependencies]\nrust-lib = { path = "../rust-lib" }\n',
            'target/CACHEDIR.TAG': 'cache\n',
          },
          'feat-simd',
        )

        // Sibling sharing target/ with active agent lock (triggers SHARED_ENV_DIRTY)
        const rustWorker = path.join(tmpDir, 'rust-consumer-worker')
        await runGit(rustConsumer, ['worktree', 'add', '-b', 'feat-worker', rustWorker])
        await createDirLink(path.join(rustConsumer, 'target'), path.join(rustWorker, 'target'))
        await fs.writeFile(path.join(rustWorker, '.claude.lock'), 'active\n', 'utf-8')

        // 3. Python library on 'main' + sibling on 'feat-py' + Python consumer on 'feat-py' (.env + .pth)
        const pyLib = await initRepo('py-lib', {
          'pyproject.toml': '[project]\nname = "py-lib"\n',
        })
        const pyLibFeat = path.join(tmpDir, 'py-lib-feat-py')
        await runGit(pyLib, ['worktree', 'add', '-b', 'feat-py', pyLibFeat])

        const pyConsumer = await initRepo(
          'py-consumer',
          {
            'pyproject.toml': '[project]\nname = "py-consumer"\n',
            '.env': 'PYTHONPATH="../py-lib"\n',
            '.venv/Lib/site-packages/py_lib.pth': '../py-lib\n',
          },
          'feat-py',
        )

        const wsConfig: WorkspaceConfig = {
          root: tmpDir,
          discoverSubdirs: true,
          repos: [
            { alias: 'shared-lib', path: sharedLib },
            { alias: 'app-one', path: appOne },
            { alias: 'app-two', path: appTwo },
            { alias: 'rust-lib', path: rustLib },
            { alias: 'rust-consumer', path: rustConsumer },
            { alias: 'py-lib', path: pyLib },
            { alias: 'py-consumer', path: pyConsumer },
          ],
        }

        const beforeSnap = await buildEcosystemSnapshot('issue18-ws', wsConfig)

        // Verify all expected warnings exist with executable fix commands
        const multiWarn = beforeSnap.warnings.find((w) => w.type === 'MULTI_CONSUMER_DIRTY')
        expect(multiWarn).toBeDefined()
        expect(multiWarn?.suggestedFixCommand).toContain('worktree add -b')
        expect(multiWarn?.suggestedFixCommand).toContain('develop-isolated')
        expect(multiWarn?.suggestedFixCommand).toContain('shared-lib-isolated')
        expect(multiWarn?.suggestedFixCommand).toContain('app-one')
        expect(multiWarn?.suggestedFixCommand).toContain('app-two')

        const sharedEnvWarn = beforeSnap.warnings.find((w) => w.type === 'SHARED_ENV_DIRTY')
        expect(sharedEnvWarn).toBeDefined()
        expect(isExecutableFix(sharedEnvWarn?.suggestedFixCommand)).toBe(true)

        const mismatchWarns = beforeSnap.warnings.filter((w) => w.type === 'BRANCH_MISMATCH')
        expect(mismatchWarns.length).toBeGreaterThanOrEqual(2)
        for (const mw of mismatchWarns) {
          expect(isExecutableFix(mw.suggestedFixCommand)).toBe(true)
        }

        // Execute every auto-fix command!
        for (const warn of [multiWarn!, sharedEnvWarn!, ...mismatchWarns]) {
          const affectedWt = beforeSnap.worktrees.find((w) =>
            warn.affectedWorktreeIds.includes(w.id),
          )
          const res = await executeFixCommand(
            warn.suggestedFixCommand!,
            affectedWt?.worktreePath || tmpDir,
          )
          expect(res.ok).toBe(true)
        }

        // Rescan and verify all fixed collisions are gone!
        const afterSnap = await buildEcosystemSnapshot('issue18-ws', wsConfig)
        expect(afterSnap.warnings.find((w) => w.type === 'MULTI_CONSUMER_DIRTY')).toBeUndefined()
        expect(afterSnap.warnings.find((w) => w.type === 'SHARED_ENV_DIRTY')).toBeUndefined()
        expect(afterSnap.warnings.find((w) => w.type === 'BRANCH_MISMATCH')).toBeUndefined()
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true })
      }
    }, 30000)
  })

  describe('copyToClipboard', () => {
    it('attempts to copy without throwing an unhandled exception', async () => {
      // In CI / test environment where clip/pbcopy may or may not succeed, it must resolve cleanly to a boolean
      const result = await copyToClipboard('test clipboard content')
      expect(typeof result).toBe('boolean')
    })
  })
})
