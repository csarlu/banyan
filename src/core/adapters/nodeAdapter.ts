import fs from 'node:fs/promises'
import path from 'node:path'
import { JunctionLink, SharedEnvInfo, WorkspaceConfig, WorktreeNode } from '../types.js'
import { quoteArg } from '../shellSafe.js'
import {
  computeTargetSubpath,
  discoverCandidateRoots,
  EcosystemAdapter,
  inspectFolderSharedEnv,
  isIntraWorktreeLink,
  pathExists,
  resolveNewTargetPath,
  resolvePathToWorktree,
} from './types.js'

const isWin = process.platform === 'win32'

async function inspectPackageEntry(
  sourceWorktree: WorktreeNode,
  packageName: string,
  linkPath: string,
  allWorktrees: WorktreeNode[],
  highlightScopes: string[],
): Promise<JunctionLink | null> {
  try {
    const lstat = await fs.lstat(linkPath)
    if (!lstat.isSymbolicLink()) {
      return null
    }

    const isHighlightedScope = highlightScopes.some(
      (scope) => packageName.startsWith(`${scope}/`) || packageName === scope,
    )

    let targetRealPath = ''
    let isBroken = false

    try {
      targetRealPath = await fs.realpath(linkPath)
    } catch {
      isBroken = true
      try {
        targetRealPath = await fs.readlink(linkPath)
      } catch {
        targetRealPath = '(destino inaccesible)'
      }
    }

    const matchedWorktree =
      !isBroken && targetRealPath ? resolvePathToWorktree(targetRealPath, allWorktrees) : undefined

    if (isIntraWorktreeLink(targetRealPath, sourceWorktree, matchedWorktree, isBroken)) {
      return null
    }

    return {
      sourceWorktreeId: sourceWorktree.id,
      sourceWorktreePath: sourceWorktree.worktreePath,
      packageName,
      linkPath,
      targetRealPath,
      targetSubpath: computeTargetSubpath(targetRealPath, matchedWorktree),
      targetWorktreeId: matchedWorktree?.id,
      targetRepoAlias: matchedWorktree?.repoAlias,
      targetBranch: matchedWorktree?.branch,
      isBroken,
      isHighlightedScope,
      ecosystem: 'node',
      mechanism: 'fs-junction',
      manifestFile: path.relative(sourceWorktree.worktreePath, linkPath).replace(/\\/g, '/'),
    }
  } catch {
    return null
  }
}

export const nodeAdapter: EcosystemAdapter = {
  id: 'node',
  label: 'Node',

  async detect(worktreePath: string): Promise<boolean> {
    const candidateRoots = await discoverCandidateRoots(worktreePath, 2)
    for (const rootDir of candidateRoots) {
      if (
        (await pathExists(path.join(rootDir, 'package.json'))) ||
        (await pathExists(path.join(rootDir, 'node_modules')))
      ) {
        return true
      }
    }
    return false
  },

  async inspectSharedEnv(
    worktreePath: string,
    allWorktrees: WorktreeNode[] = [],
  ): Promise<SharedEnvInfo | null> {
    if (!(await this.detect(worktreePath))) return null
    return inspectFolderSharedEnv(
      worktreePath,
      'node',
      ['node_modules'],
      'node_modules',
      allWorktrees,
    )
  },

  async scanLinks(
    worktree: WorktreeNode,
    allWorktrees: WorktreeNode[],
    config: WorkspaceConfig,
  ): Promise<JunctionLink[]> {
    const nodeEnabled = config.adapters?.node?.enabled ?? 'auto'
    if (nodeEnabled === false) return []

    const highlightScopes = config.adapters?.node?.highlightScopes ?? []
    const candidateRoots = await discoverCandidateRoots(worktree.worktreePath, 2)
    const links: JunctionLink[] = []
    const tasks: Promise<JunctionLink | null>[] = []

    for (const rootDir of candidateRoots) {
      const nmPath = path.join(rootDir, 'node_modules')
      try {
        const nmStat = await fs.lstat(nmPath)
        if (nmStat.isSymbolicLink()) {
          // If node_modules itself is a shared symlink/junction pointing to another worktree,
          // it is already tracked as a shared environment (SHARED_ENV_DIRTY). Do not attribute
          // the host worktree's internal workspace links or dependencies to this consumer worktree.
          const nmReal = await fs.realpath(nmPath).catch(() => '')
          const hostWt = nmReal ? resolvePathToWorktree(nmReal, allWorktrees) : undefined
          if (hostWt && hostWt.id !== worktree.id) {
            continue
          }
        }
      } catch {
        continue
      }

      let topEntries: import('node:fs').Dirent[] = []
      try {
        topEntries = await fs.readdir(nmPath, { withFileTypes: true })
      } catch {
        continue
      }

      for (const entry of topEntries) {
        if (entry.name.startsWith('.')) continue
        const entryFullPath = path.join(nmPath, entry.name)

        if (entry.name.startsWith('@')) {
          try {
            const scopedEntries = await fs.readdir(entryFullPath, { withFileTypes: true })
            for (const subEntry of scopedEntries) {
              const pkgName = `${entry.name}/${subEntry.name}`
              const subFullPath = path.join(entryFullPath, subEntry.name)
              tasks.push(
                inspectPackageEntry(worktree, pkgName, subFullPath, allWorktrees, highlightScopes),
              )
            }
          } catch {
            // Ignore inaccessible scope dirs
          }
        } else {
          tasks.push(
            inspectPackageEntry(worktree, entry.name, entryFullPath, allWorktrees, highlightScopes),
          )
        }
      }
    }

    const results = await Promise.allSettled(tasks)
    for (const res of results) {
      if (res.status === 'fulfilled' && res.value) {
        links.push(res.value)
      }
    }

    return links
  },

  buildFixCommand(link: JunctionLink, newTargetWorktree: WorktreeNode): string {
    const newTarget = resolveNewTargetPath(link, newTargetWorktree)
    if (isWin) {
      return `cmd /c rmdir ${quoteArg(link.linkPath)} && mklink /J ${quoteArg(link.linkPath)} ${quoteArg(newTarget)}`
    }
    return `rm -rf ${quoteArg(link.linkPath)} && ln -s ${quoteArg(newTarget)} ${quoteArg(link.linkPath)}`
  },
}
