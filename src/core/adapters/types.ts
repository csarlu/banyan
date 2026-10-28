import fs from 'node:fs/promises'
import path from 'node:path'
import {
  EcosystemId,
  JunctionLink,
  SharedEnvInfo,
  WorkspaceConfig,
  WorktreeNode,
} from '../types.js'

export interface EcosystemAdapter {
  id: EcosystemId
  label: string
  detect(worktreePath: string): Promise<boolean>
  inspectSharedEnv(
    worktreePath: string,
    allWorktrees?: WorktreeNode[],
  ): Promise<SharedEnvInfo | null>
  scanLinks(
    worktree: WorktreeNode,
    allWorktrees: WorktreeNode[],
    config: WorkspaceConfig,
  ): Promise<JunctionLink[]>
  buildFixCommand(link: JunctionLink, newTargetWorktree: WorktreeNode): string
}

export const IGNORED_SCAN_DIRS = new Set([
  '.git',
  'node_modules',
  '.venv',
  'venv',
  'env',
  'target',
  'dist',
  'build',
  'bin',
  'obj',
  'out',
  'coverage',
  '__pycache__',
  '.next',
  '.turbo',
  '.cache',
])

/**
 * Returns the worktree root plus non-hidden subdirectories up to maxDepth (default 2).
 * Used by language adapters to support full-stack repos (frontend/, backend/)
 * and monorepo layouts (apps/*, packages/*, services/*, crates/*).
 */
export async function discoverCandidateRoots(
  worktreePath: string,
  maxDepth: number = 2,
): Promise<string[]> {
  const roots: string[] = [worktreePath]

  async function walk(currentDir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return
    let entries: import('node:fs').Dirent[] = []
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.') || IGNORED_SCAN_DIRS.has(entry.name)) continue
      const fullPath = path.join(currentDir, entry.name)
      roots.push(fullPath)
      if (depth < maxDepth) {
        await walk(fullPath, depth + 1)
      }
    }
  }

  await walk(worktreePath, 1)
  return roots
}

/**
 * Returns true if targetRealPath resolves inside the SAME sourceWorktree (and is not broken).
 * Intra-monorepo links inside the same worktree checkout are naturally isolated and must not
 * be flagged as cross-worktree links.
 */
export function isIntraWorktreeLink(
  targetRealPath: string,
  sourceWorktree: WorktreeNode,
  matchedWorktree: WorktreeNode | undefined,
  isBroken: boolean,
): boolean {
  if (isBroken || !targetRealPath) return false
  if (matchedWorktree && matchedWorktree.id === sourceWorktree.id) return true
  const normSource = path.resolve(sourceWorktree.worktreePath).toLowerCase()
  const normTarget = path.resolve(targetRealPath).toLowerCase()
  return normTarget === normSource || normTarget.startsWith(normSource + path.sep)
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

export function resolvePathToWorktree(
  targetPath: string,
  allWorktrees: WorktreeNode[],
): WorktreeNode | undefined {
  if (!targetPath) return undefined
  const normTarget = path.resolve(targetPath).toLowerCase()
  const sortedWts = [...allWorktrees].sort((a, b) => b.worktreePath.length - a.worktreePath.length)
  return sortedWts.find((wt) => {
    const normWt = path.resolve(wt.worktreePath).toLowerCase()
    return normTarget === normWt || normTarget.startsWith(normWt + path.sep)
  })
}

export function computeTargetSubpath(
  targetPath: string,
  matchedWorktree?: WorktreeNode,
): string | undefined {
  if (!targetPath || !matchedWorktree) return undefined
  const rel = path.relative(path.resolve(matchedWorktree.worktreePath), path.resolve(targetPath))
  if (!rel || rel === '.' || rel.startsWith('..') || path.isAbsolute(rel)) {
    return undefined
  }
  return rel.replace(/\\/g, '/')
}

export function resolveNewTargetPath(link: JunctionLink, newTargetWorktree: WorktreeNode): string {
  if (!link.targetSubpath) {
    return newTargetWorktree.worktreePath
  }
  const useWin = newTargetWorktree.worktreePath.includes('\\')
  const normalizedSub = link.targetSubpath.replace(/[\\/]+/g, useWin ? '\\' : '/')
  return useWin
    ? path.win32.join(newTargetWorktree.worktreePath, normalizedSub)
    : path.posix.join(newTargetWorktree.worktreePath, normalizedSub)
}

export function resolveReplacementStrings(
  link: JunctionLink,
  newTargetWorktree: WorktreeNode,
): { oldStr: string; newStr: string } {
  const newTargetPath = resolveNewTargetPath(link, newTargetWorktree)

  if (link.rawTarget) {
    const raw = link.rawTarget
    if (raw.startsWith('.')) {
      const baseDir = link.sourceWorktreePath || path.dirname(link.linkPath)
      const useBackslash = raw.includes('\\')
      const rel = path.relative(path.resolve(baseDir), path.resolve(newTargetPath))
      let formattedRel = useBackslash ? rel.replace(/\//g, '\\') : rel.replace(/\\/g, '/')
      if (!formattedRel.startsWith('.')) {
        formattedRel = (useBackslash ? '.\\' : './') + formattedRel
      }
      return { oldStr: raw, newStr: formattedRel }
    }
    const useBackslash = raw.includes('\\')
    return {
      oldStr: raw,
      newStr: useBackslash ? newTargetPath.replace(/\//g, '\\') : newTargetPath.replace(/\\/g, '/'),
    }
  }

  const useBackslash =
    link.targetRealPath.includes('\\') && newTargetWorktree.worktreePath.includes('\\')
  return {
    oldStr: useBackslash
      ? link.targetRealPath.replace(/\//g, '\\')
      : link.targetRealPath.replace(/\\/g, '/'),
    newStr: useBackslash ? newTargetPath.replace(/\//g, '\\') : newTargetPath.replace(/\\/g, '/'),
  }
}

export async function inspectFolderSharedEnv(
  worktreePath: string,
  ecosystem: EcosystemId,
  folderCandidates: string[],
  defaultEnvName: string,
  allWorktrees: WorktreeNode[] = [],
): Promise<SharedEnvInfo> {
  const candidateRoots = await discoverCandidateRoots(worktreePath, 2)
  let firstOwn: SharedEnvInfo | null = null

  for (const rootDir of candidateRoots) {
    for (const candidate of folderCandidates) {
      const fullPath = path.join(rootDir, candidate)
      const envName =
        rootDir === worktreePath
          ? candidate
          : path.relative(worktreePath, fullPath).replace(/\\/g, '/')

      try {
        const st = await fs.lstat(fullPath)
        if (st.isSymbolicLink()) {
          let targetRealPath = ''
          try {
            targetRealPath = await fs.realpath(fullPath)
          } catch {
            try {
              targetRealPath = await fs.readlink(fullPath)
            } catch {
              targetRealPath = '(destino inaccesible)'
            }
          }
          const matchedWt = resolvePathToWorktree(targetRealPath, allWorktrees)
          return {
            ecosystem,
            envName,
            type: 'shared',
            targetRealPath,
            targetWorktreeId: matchedWt?.id,
          }
        }
        if (st.isDirectory() && !firstOwn) {
          firstOwn = {
            ecosystem,
            envName,
            type: 'own',
          }
        }
      } catch {
        // Try next candidate
      }
    }
  }

  if (firstOwn) {
    return firstOwn
  }

  return {
    ecosystem,
    envName: defaultEnvName,
    type: 'none',
  }
}
