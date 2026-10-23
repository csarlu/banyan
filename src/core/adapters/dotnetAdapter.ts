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

export interface ParsedCsprojRef {
  projectName: string
  includePath: string
}

export function parseCsprojReferences(content: string): ParsedCsprojRef[] {
  const results: ParsedCsprojRef[] = []
  const regex = /<ProjectReference\s+[^>]*Include\s*=\s*["']([^"']+)["'][^>]*>/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    const rawInclude = match[1].trim()
    if (!rawInclude) continue
    const normalized = rawInclude.replace(/\\/g, '/')
    const base = path.posix.basename(normalized).replace(/\.(csproj|fsproj|vbproj)$/i, '')
    results.push({
      projectName: base || rawInclude,
      includePath: rawInclude,
    })
  }
  return results
}

async function findCsprojFiles(
  worktreePath: string,
  maxDepth: number = 4,
): Promise<{ fullPath: string; relPath: string }[]> {
  const found: { fullPath: string; relPath: string }[] = []
  const ignored = new Set(['node_modules', 'bin', 'obj', 'target', 'dist', '.venv', 'venv', '.git'])

  async function walk(currentDir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return
    let entries: import('node:fs').Dirent[] = []
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (ignored.has(entry.name)) continue
      const fullPath = path.join(currentDir, entry.name)
      if (entry.isFile() && /\.(csproj|fsproj|vbproj)$/i.test(entry.name)) {
        found.push({
          fullPath,
          relPath: path.relative(worktreePath, fullPath).replace(/\\/g, '/'),
        })
      } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
        await walk(fullPath, depth + 1)
      }
    }
  }

  await walk(worktreePath, 1)
  return found
}

async function hasSlnOrCsproj(worktreePath: string): Promise<boolean> {
  try {
    const topEntries = await fs.readdir(worktreePath, { withFileTypes: true })
    if (topEntries.some((e) => e.isFile() && /\.(sln|slnx|csproj|fsproj|vbproj)$/i.test(e.name))) {
      return true
    }
  } catch {
    // Ignore
  }
  const csprojs = await findCsprojFiles(worktreePath)
  return csprojs.length > 0
}

export const dotnetAdapter: EcosystemAdapter = {
  id: 'dotnet',
  label: '.NET',

  async detect(worktreePath: string): Promise<boolean> {
    return hasSlnOrCsproj(worktreePath)
  },

  async inspectSharedEnv(
    worktreePath: string,
    allWorktrees: WorktreeNode[] = [],
  ): Promise<SharedEnvInfo | null> {
    if (!(await this.detect(worktreePath))) return null
    return inspectFolderSharedEnv(worktreePath, 'dotnet', ['obj', 'bin'], 'obj', allWorktrees)
  },

  async scanLinks(
    worktree: WorktreeNode,
    allWorktrees: WorktreeNode[],
    config: WorkspaceConfig,
  ): Promise<JunctionLink[]> {
    if (config.adapters?.dotnet?.enabled === false) return []

    const links: JunctionLink[] = []
    const wtPath = worktree.worktreePath
    const normSelf = path.resolve(wtPath).toLowerCase()
    const csprojFiles = await findCsprojFiles(wtPath)

    for (const projFile of csprojFiles) {
      try {
        const content = await fs.readFile(projFile.fullPath, 'utf-8')
        const refs = parseCsprojReferences(content)
        const projDir = path.dirname(projFile.fullPath)

        for (const ref of refs) {
          const normalizedInclude = ref.includePath.replace(/\\/g, path.sep)
          const resolvedTarget = path.resolve(projDir, normalizedInclude)
          const normTarget = resolvedTarget.toLowerCase()

          if (normTarget === normSelf || normTarget.startsWith(normSelf + path.sep)) {
            continue
          }

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

          links.push({
            sourceWorktreeId: worktree.id,
            sourceWorktreePath: wtPath,
            packageName: ref.projectName,
            linkPath: projFile.fullPath,
            targetRealPath,
            rawTarget: ref.includePath,
            targetSubpath: computeTargetSubpath(targetRealPath, matchedWt),
            targetWorktreeId: matchedWt?.id,
            targetRepoAlias: matchedWt?.repoAlias,
            targetBranch: matchedWt?.branch,
            isBroken: !exists,
            isHighlightedScope: true,
            ecosystem: 'dotnet',
            mechanism: 'dotnet-projref',
            manifestFile: projFile.relPath,
          })
        }
      } catch {
        // Ignore read error
      }
    }

    return links
  },

  buildFixCommand(link: JunctionLink, newTargetWorktree: WorktreeNode): string {
    const manifest = link.manifestFile || link.linkPath
    const newTarget = resolveNewTargetPath(link, newTargetWorktree)
    return `dotnet remove ${quoteArg(manifest)} reference ${quoteArg(link.targetRealPath)} && dotnet add ${quoteArg(manifest)} reference ${quoteArg(newTarget)}`
  },
}
