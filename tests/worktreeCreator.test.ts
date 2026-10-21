import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createWorktreeWithStrategy } from '../src/core/worktreeCreator.js'
import { WorktreeNode } from '../src/core/types.js'

const execFileAsync = promisify(execFile)

describe('In-TUI Worktree Creation Wizard (BAN-6)', () => {
  let tempDir: string
  let mainRepoDir: string

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bny-create-wt-'))
    mainRepoDir = path.join(tempDir, 'main-repo')
    await fs.mkdir(mainRepoDir, { recursive: true })

    // Initialize git repo with main branch and an initial commit
    await execFileAsync('git', ['init', '-b', 'main'], { cwd: mainRepoDir })
    await execFileAsync('git', ['config', 'user.email', 'test@banyan.dev'], { cwd: mainRepoDir })
    await execFileAsync('git', ['config', 'user.name', 'Banyan Tester'], { cwd: mainRepoDir })

    await fs.writeFile(path.join(mainRepoDir, 'README.md'), '# Main Repo', 'utf-8')
    await execFileAsync('git', ['add', '.'], { cwd: mainRepoDir })
    await execFileAsync('git', ['commit', '-m', 'Initial commit'], { cwd: mainRepoDir })
  })

  afterAll(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors on locked temporary files
    }
  })

  it('creates a new clean Git worktree with -b branch', async () => {
    const targetPath = path.join(tempDir, 'wt-clean-feature')
    const dummySource: WorktreeNode = {
      id: 'main-repo:main',
      relPath: '.',
      repoAlias: 'main-repo',
      repoPath: mainRepoDir,
      worktreePath: mainRepoDir,
      branch: 'main',
      headSha: '1234567',
      isBare: false,
      dirtyCount: 0,
      ahead: 0,
      behind: 0,
      recentCommits: [],
      nodeModulesType: 'own',
      agentStatus: { isActive: false },
    }

    const res = await createWorktreeWithStrategy({
      repoPath: mainRepoDir,
      branch: 'feat-payments',
      targetPath,
      strategy: 'clean',
      sourceWorktree: dummySource,
    })

    expect(res.ok).toBe(true)
    expect(res.branch).toBe('feat-payments')
    expect(res.appliedLinksCount).toBe(0)

    const stat = await fs.stat(targetPath)
    expect(stat.isDirectory()).toBe(true)

    // Verify git branch in the new worktree
    const { stdout } = await execFileAsync('git', ['branch', '--show-current'], { cwd: targetPath })
    expect(stdout.trim()).toBe('feat-payments')
  })

  it('creates a worktree with shared-root strategy and links node_modules', async () => {
    // Create dummy node_modules in main repo
    const sourceNm = path.join(mainRepoDir, 'node_modules')
    await fs.mkdir(sourceNm, { recursive: true })
    await fs.writeFile(path.join(sourceNm, 'package.json'), '{"name":"dummy"}', 'utf-8')

    const targetPath = path.join(tempDir, 'wt-shared-nm')
    const dummySource: WorktreeNode = {
      id: 'main-repo:main',
      relPath: '.',
      repoAlias: 'main-repo',
      repoPath: mainRepoDir,
      worktreePath: mainRepoDir,
      branch: 'main',
      headSha: '1234567',
      isBare: false,
      dirtyCount: 0,
      ahead: 0,
      behind: 0,
      recentCommits: [],
      nodeModulesType: 'own',
      agentStatus: { isActive: false },
    }

    const res = await createWorktreeWithStrategy({
      repoPath: mainRepoDir,
      branch: 'feat-shared',
      targetPath,
      strategy: 'shared-root',
      sourceWorktree: dummySource,
    })

    expect(res.ok).toBe(true)
    expect(res.appliedLinksCount).toBeGreaterThanOrEqual(1)

    const targetNm = path.join(targetPath, 'node_modules')
    const stat = await fs.stat(targetNm)
    expect(stat.isDirectory()).toBe(true)
    const dummyPkg = await fs.readFile(path.join(targetNm, 'package.json'), 'utf-8')
    expect(dummyPkg).toContain('dummy')
  })
})
