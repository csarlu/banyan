import fs from 'node:fs/promises'
import path from 'node:path'
import { JunctionLink, SharedEnvInfo, WorkspaceConfig, WorktreeNode } from '../types.js'
import { quoteArg } from '../shellSafe.js'
import {
  computeTargetSubpath,
  EcosystemAdapter,
  inspectFolderSharedEnv,
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
    return (
      (await pathExists(path.join(worktreePath, 'package.json'))) ||
      (await pathExists(path.join(worktreePath, 'node_modules')))
    )
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
    const nmPath = path.join(worktree.worktreePath, 'node_modules')
    const links: JunctionLink[] = []

    let topEntries: import('node:fs').Dirent[] = []
    try {
      topEntries = await fs.readdir(nmPath, { withFileTypes: true })
    } catch {
      return []
    }

    const tasks: Promise<JunctionLink | null>[] = []

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
