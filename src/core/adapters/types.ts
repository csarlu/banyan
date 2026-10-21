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

export async function inspectFolderSharedEnv(
  worktreePath: string,
  ecosystem: EcosystemId,
  folderCandidates: string[],
  defaultEnvName: string,
  allWorktrees: WorktreeNode[] = [],
): Promise<SharedEnvInfo> {
  for (const candidate of folderCandidates) {
    const fullPath = path.join(worktreePath, candidate)
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
          envName: candidate,
          type: 'shared',
          targetRealPath,
          targetWorktreeId: matchedWt?.id,
        }
      }
      if (st.isDirectory()) {
        return {
          ecosystem,
          envName: candidate,
          type: 'own',
        }
      }
    } catch {
      // Try next candidate
    }
  }
  return {
    ecosystem,
    envName: defaultEnvName,
    type: 'none',
  }
}
