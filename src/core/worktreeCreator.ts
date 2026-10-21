import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import { JunctionLink, WorktreeNode } from './types.js'

const execFileAsync = promisify(execFile)

export type WorktreeLinkStrategy = 'clone-links' | 'shared-root' | 'clean'

export interface CreateWorktreeOptions {
  repoPath: string
  branch: string
  targetPath: string
  strategy: WorktreeLinkStrategy
  sourceWorktree?: WorktreeNode
  allWorktrees?: WorktreeNode[]
  junctions?: JunctionLink[]
}

export interface CreateWorktreeResult {
  ok: boolean
  worktreePath: string
  branch: string
  appliedLinksCount: number
  error?: string
}

async function runGit(
  cwd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, { cwd, windowsHide: true })
    return { stdout: stdout.trim(), stderr: stderr.trim(), code: 0 }
  } catch (err: any) {
    return {
      stdout: err?.stdout?.trim() || '',
      stderr: err?.stderr?.trim() || err?.message || '',
      code: err?.code || 1,
    }
  }
}

export async function createDirLink(target: string, destination: string): Promise<boolean> {
  try {
    await fs.mkdir(path.dirname(destination), { recursive: true })
    try {
      await fs.rm(destination, { recursive: true, force: true })
    } catch {}

    const type = process.platform === 'win32' ? 'junction' : 'dir'
    await fs.symlink(target, destination, type)
    return true
  } catch {
    if (process.platform === 'win32') {
      try {
        await execFileAsync('cmd.exe', ['/c', 'mklink', '/J', destination, target])
        return true
      } catch {
        return false
      }
    }
    return false
  }
}

/**
 * Creates a new Git worktree and applies the specified link and environment strategy.
 */
export async function createWorktreeWithStrategy(
  options: CreateWorktreeOptions,
): Promise<CreateWorktreeResult> {
  const { repoPath, branch, targetPath, strategy, sourceWorktree, allWorktrees, junctions } =
    options
  const resolvedTarget = path.resolve(targetPath)

  // Reject branch names that git (or an option parser) could misinterpret, e.g. "--orphan" or "-f".
  if (
    !branch ||
    branch.startsWith('-') ||
    /[\s~^:?*\[\\\x00-\x1f\x7f]|\.\.|@\{|\/\/|\.lock$|\/$/.test(branch)
  ) {
    return {
      ok: false,
      worktreePath: resolvedTarget,
      branch,
      appliedLinksCount: 0,
      error: `Invalid branch name: "${branch}"`,
    }
  }

  // 1. Verify if branch already exists in repo
  const checkRes = await runGit(repoPath, ['branch', '--list', branch])
  const branchExists = checkRes.code === 0 && checkRes.stdout.length > 0

  const addArgs = branchExists
    ? ['worktree', 'add', resolvedTarget, branch]
    : ['worktree', 'add', '-b', branch, resolvedTarget]

  const addRes = await runGit(repoPath, addArgs)
  if (addRes.code !== 0) {
    return {
      ok: false,
      worktreePath: resolvedTarget,
      branch,
      appliedLinksCount: 0,
      error: addRes.stderr || 'git worktree add failed',
    }
  }

  let appliedLinksCount = 0

  // 2. Apply chosen link/environment strategy
  if (strategy === 'clone-links' && sourceWorktree && junctions) {
    const sourceLinks = junctions.filter((j) => j.sourceWorktreeId === sourceWorktree.id)

    for (const link of sourceLinks) {
      const rel = path.relative(sourceWorktree.worktreePath, link.linkPath)
      const newLinkPath = path.resolve(resolvedTarget, rel)

      // Check if target repository has a worktree matching the new branch
      let targetDir = link.targetRealPath
      if (allWorktrees && link.targetRepoAlias) {
        const matchingSibling = allWorktrees.find(
          (w) => w.repoAlias === link.targetRepoAlias && w.branch === branch && !w.isBare,
        )
        if (matchingSibling) {
          targetDir = matchingSibling.worktreePath
        }
      }

      const stat = await fs.stat(targetDir).catch(() => null)
      if (stat && stat.isDirectory()) {
        const ok = await createDirLink(targetDir, newLinkPath)
        if (ok) appliedLinksCount++
      }
    }

    // Also share root node_modules or .venv if present in source
    const sourceNm = path.join(sourceWorktree.worktreePath, 'node_modules')
    const targetNm = path.join(resolvedTarget, 'node_modules')
    const nmStat = await fs.stat(sourceNm).catch(() => null)
    const targetStat = await fs.stat(targetNm).catch(() => null)
    if (nmStat && nmStat.isDirectory() && !targetStat) {
      const ok = await createDirLink(sourceNm, targetNm)
      if (ok) appliedLinksCount++
    }
  } else if (strategy === 'shared-root' && sourceWorktree) {
    // Symlink/junction root node_modules or .venv
    const candidates = ['node_modules', '.venv']
    for (const cand of candidates) {
      const src = path.join(sourceWorktree.worktreePath, cand)
      const dst = path.join(resolvedTarget, cand)
      const stat = await fs.stat(src).catch(() => null)
      if (stat && stat.isDirectory()) {
        const ok = await createDirLink(src, dst)
        if (ok) appliedLinksCount++
      }
    }
  }

  return {
    ok: true,
    worktreePath: resolvedTarget,
    branch,
    appliedLinksCount,
  }
}
