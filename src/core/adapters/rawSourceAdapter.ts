import fs from 'node:fs/promises'
import path from 'node:path'
import { JunctionLink, SharedEnvInfo, WorkspaceConfig, WorktreeNode } from '../types.js'
import { commentSafe, quoteArg } from '../shellSafe.js'
import {
  computeTargetSubpath,
  discoverCandidateRoots,
  EcosystemAdapter,
  isIntraWorktreeLink,
  pathExists,
  resolveNewTargetPath,
  resolvePathToWorktree,
} from './types.js'

const isWin = process.platform === 'win32'

const EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  '.venv',
  'venv',
  'target',
  'dist',
  'build',
  'bin',
  'obj',
  '__pycache__',
  '.next',
  '.turbo',
])

export interface ParsedTsConfigPath {
  alias: string
  targetPath: string
}

export function parseTsConfigPaths(rawJsonc: string): ParsedTsConfigPath[] {
  const results: ParsedTsConfigPath[] = []
  try {
    // Strip single-line and multi-line comments and trailing commas for JSONC compatibility
    const withoutComments = rawJsonc
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/,\s*([\]}])/g, '$1')

    const parsed = JSON.parse(withoutComments)
    const baseUrl: string = parsed?.compilerOptions?.baseUrl || '.'
    const pathsObj = parsed?.compilerOptions?.paths
    if (!pathsObj || typeof pathsObj !== 'object') return []

    for (const [aliasKey, targets] of Object.entries(pathsObj)) {
      if (!Array.isArray(targets)) continue
      const cleanAlias = aliasKey.replace(/\/\*$/, '')
      for (const rawTarget of targets) {
        if (typeof rawTarget !== 'string') continue
        const cleanTarget = rawTarget.replace(/\/\*$/, '')
        const combined =
          baseUrl && baseUrl !== '.' ? path.posix.join(baseUrl, cleanTarget) : cleanTarget
        results.push({
          alias: cleanAlias,
          targetPath: combined,
        })
      }
    }
  } catch {
    // Ignore malformed tsconfig
  }
  return results
}

export async function scanSourceSymlinks(
  worktree: WorktreeNode,
  allWorktrees: WorktreeNode[],
  maxDepth: number = 3,
): Promise<JunctionLink[]> {
  const links: JunctionLink[] = []
  const wtPath = worktree.worktreePath
  const normSelf = path.resolve(wtPath).toLowerCase()

  async function walk(currentDir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return
    let entries: import('node:fs').Dirent[] = []
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (EXCLUDED_DIRS.has(entry.name)) continue
      const fullPath = path.join(currentDir, entry.name)

      try {
        const st = await fs.lstat(fullPath)
        if (st.isSymbolicLink()) {
          let targetRealPath = ''
          let isBroken = false
          try {
            targetRealPath = await fs.realpath(fullPath)
          } catch {
            isBroken = true
            try {
              const rawLink = await fs.readlink(fullPath)
              targetRealPath = path.resolve(path.dirname(fullPath), rawLink)
            } catch {
              targetRealPath = '(destino inaccesible)'
            }
          }

          if (!isBroken && targetRealPath) {
            const normTarget = path.resolve(targetRealPath).toLowerCase()
            if (normTarget === normSelf || normTarget.startsWith(normSelf + path.sep)) {
              // Internal symlink within the same worktree
              continue
            }
          }

          const matchedWt = resolvePathToWorktree(targetRealPath, allWorktrees)
          const relManifest = path.relative(wtPath, fullPath).replace(/\\/g, '/')

          links.push({
            sourceWorktreeId: worktree.id,
            sourceWorktreePath: wtPath,
            packageName: relManifest,
            linkPath: fullPath,
            targetRealPath,
            targetSubpath: computeTargetSubpath(targetRealPath, matchedWt),
            targetWorktreeId: matchedWt?.id,
            targetRepoAlias: matchedWt?.repoAlias,
            targetBranch: matchedWt?.branch,
            isBroken,
            isHighlightedScope: true,
            ecosystem: 'raw',
            mechanism: 'source-symlink',
            manifestFile: relManifest,
          })
          continue
        }

        if (st.isDirectory() && !entry.name.startsWith('.')) {
          await walk(fullPath, depth + 1)
        }
      } catch {
        // Ignore inaccessible entry
      }
    }
  }

  await walk(wtPath, 1)
  return links
}

export async function scanTsConfigPaths(
  worktree: WorktreeNode,
  allWorktrees: WorktreeNode[],
): Promise<JunctionLink[]> {
  const links: JunctionLink[] = []
  const wtPath = worktree.worktreePath
  const candidateRoots = await discoverCandidateRoots(wtPath, 2)

  for (const candidateRoot of candidateRoots) {
    for (const fileName of ['tsconfig.json', 'tsconfig.base.json', 'jsconfig.json']) {
      const fullPath = path.join(candidateRoot, fileName)
      if (!(await pathExists(fullPath))) continue

      try {
        const content = await fs.readFile(fullPath, 'utf-8')
        const parsedPaths = parseTsConfigPaths(content)
        const relManifest = path.relative(wtPath, fullPath).replace(/\\/g, '/')
        for (const item of parsedPaths) {
          const resolvedTarget = path.resolve(candidateRoot, item.targetPath)
          const exists = await pathExists(resolvedTarget)
          let targetRealPath = resolvedTarget
          if (exists) {
            try {
              targetRealPath = await fs.realpath(resolvedTarget)
            } catch {
              targetRealPath = resolvedTarget
            }
          }
          const matchedWt = resolvePathToWorktree(targetRealPath, allWorktrees)
          if (isIntraWorktreeLink(targetRealPath, worktree, matchedWt, !exists)) {
            continue
          }

          links.push({
            sourceWorktreeId: worktree.id,
            sourceWorktreePath: wtPath,
            packageName: item.alias,
            linkPath: fullPath,
            targetRealPath,
            rawTarget: item.targetPath,
            targetSubpath: computeTargetSubpath(targetRealPath, matchedWt),
            targetWorktreeId: matchedWt?.id,
            targetRepoAlias: matchedWt?.repoAlias,
            targetBranch: matchedWt?.branch,
            isBroken: !exists,
            isHighlightedScope: true,
            ecosystem: 'node',
            mechanism: 'tsconfig-path',
            manifestFile: relManifest,
          })
        }
      } catch {
        // Ignore read error
      }
    }
  }

  return links
}

export const rawSourceAdapter: EcosystemAdapter = {
  id: 'raw',
  label: 'Raw',

  async detect(): Promise<boolean> {
    return true
  },

  async inspectSharedEnv(): Promise<SharedEnvInfo | null> {
    return null
  },

  async scanLinks(
    worktree: WorktreeNode,
    allWorktrees: WorktreeNode[],
    config: WorkspaceConfig,
  ): Promise<JunctionLink[]> {
    if (config.adapters?.raw?.enabled === false) return []

    const [symlinks, tsPaths] = await Promise.all([
      scanSourceSymlinks(worktree, allWorktrees, 3),
      scanTsConfigPaths(worktree, allWorktrees),
    ])

    return [...symlinks, ...tsPaths]
  },

  buildFixCommand(link: JunctionLink, newTargetWorktree: WorktreeNode): string {
    const newTarget = resolveNewTargetPath(link, newTargetWorktree)
    if (link.mechanism === 'tsconfig-path') {
      return `# Update compilerOptions.paths["${commentSafe(link.packageName)}"] in ${commentSafe(link.manifestFile || 'tsconfig.json')} to point to "${commentSafe(newTarget.replace(/\\/g, '/'))}"`
    }
    if (isWin) {
      return `cmd /c rmdir ${quoteArg(link.linkPath)} && mklink /J ${quoteArg(link.linkPath)} ${quoteArg(newTarget)}`
    }
    return `rm -rf ${quoteArg(link.linkPath)} && ln -s ${quoteArg(newTarget)} ${quoteArg(link.linkPath)}`
  },
}
