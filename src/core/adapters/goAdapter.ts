import fs from 'node:fs/promises'
import path from 'node:path'
import { JunctionLink, SharedEnvInfo, WorkspaceConfig, WorktreeNode } from '../types.js'
import { commentSafe, quoteArg, safeToken } from '../shellSafe.js'
import { EcosystemAdapter, pathExists, resolvePathToWorktree } from './types.js'

export interface ParsedGoReplace {
  moduleName: string
  targetPath: string
}

export function parseGoModReplaces(content: string): ParsedGoReplace[] {
  const results: ParsedGoReplace[] = []
  const cleanLines = content.split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '').trim())

  let inReplaceBlock = false
  for (const line of cleanLines) {
    if (!line) continue

    if (/^replace\s*\($/.test(line)) {
      inReplaceBlock = true
      continue
    }
    if (inReplaceBlock && line === ')') {
      inReplaceBlock = false
      continue
    }

    const candidate = inReplaceBlock
      ? line
      : line.startsWith('replace ')
        ? line.slice('replace '.length).trim()
        : null

    if (candidate && candidate.includes('=>')) {
      const [left, right] = candidate.split('=>').map((s) => s.trim())
      if (left && right) {
        const modTokens = left.split(/\s+/)
        const moduleName = modTokens[0]
        const targetTokens = right.split(/\s+/)
        const targetCandidate = targetTokens[0]

        // Only local filesystem paths (relative ./, ../ or absolute / or Windows drive)
        if (
          targetCandidate.startsWith('.') ||
          targetCandidate.startsWith('/') ||
          targetCandidate.startsWith('\\') ||
          /^[a-zA-Z]:[\\/]/.test(targetCandidate)
        ) {
          results.push({
            moduleName,
            targetPath: targetCandidate,
          })
        }
      }
    }
  }

  return results
}

export function parseGoWorkUses(content: string): string[] {
  const paths: string[] = []
  const cleanLines = content.split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '').trim())

  let inUseBlock = false
  for (const line of cleanLines) {
    if (!line) continue
    if (/^use\s*\($/.test(line)) {
      inUseBlock = true
      continue
    }
    if (inUseBlock && line === ')') {
      inUseBlock = false
      continue
    }

    const candidate = inUseBlock
      ? line
      : line.startsWith('use ')
        ? line.slice('use '.length).trim()
        : null

    if (candidate) {
      const cleaned = candidate.replace(/^['"]|['"]$/g, '').trim()
      if (cleaned && cleaned !== '.') {
        paths.push(cleaned)
      }
    }
  }
  return paths
}

export const goAdapter: EcosystemAdapter = {
  id: 'go',
  label: 'Go',

  async detect(worktreePath: string): Promise<boolean> {
    return (
      (await pathExists(path.join(worktreePath, 'go.mod'))) ||
      (await pathExists(path.join(worktreePath, 'go.work')))
    )
  },

  async inspectSharedEnv(): Promise<SharedEnvInfo | null> {
    return null
  },

  async scanLinks(
    worktree: WorktreeNode,
    allWorktrees: WorktreeNode[],
    config: WorkspaceConfig,
  ): Promise<JunctionLink[]> {
    if (config.adapters?.go?.enabled === false) return []

    const links: JunctionLink[] = []
    const wtPath = worktree.worktreePath
    const normSelf = path.resolve(wtPath).toLowerCase()

    const goModPath = path.join(wtPath, 'go.mod')
    if (await pathExists(goModPath)) {
      try {
        const content = await fs.readFile(goModPath, 'utf-8')
        const replaces = parseGoModReplaces(content)
        for (const rep of replaces) {
          const resolvedTarget = path.resolve(wtPath, rep.targetPath)
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
            packageName: rep.moduleName,
            linkPath: goModPath,
            targetRealPath,
            targetWorktreeId: matchedWt?.id,
            targetRepoAlias: matchedWt?.repoAlias,
            targetBranch: matchedWt?.branch,
            isBroken: !exists,
            isHighlightedScope: true,
            ecosystem: 'go',
            mechanism: 'go-mod-replace',
            manifestFile: 'go.mod',
          })
        }
      } catch {
        // Ignore read error
      }
    }

    const goWorkPath = path.join(wtPath, 'go.work')
    if (await pathExists(goWorkPath)) {
      try {
        const content = await fs.readFile(goWorkPath, 'utf-8')
        const uses = parseGoWorkUses(content)
        for (const useDir of uses) {
          const resolvedTarget = path.resolve(wtPath, useDir)
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
          const pkgName = path.basename(resolvedTarget) || useDir

          links.push({
            sourceWorktreeId: worktree.id,
            sourceWorktreePath: wtPath,
            packageName: pkgName,
            linkPath: goWorkPath,
            targetRealPath,
            targetWorktreeId: matchedWt?.id,
            targetRepoAlias: matchedWt?.repoAlias,
            targetBranch: matchedWt?.branch,
            isBroken: !exists,
            isHighlightedScope: true,
            ecosystem: 'go',
            mechanism: 'go-mod-replace',
            manifestFile: 'go.work',
          })
        }
      } catch {
        // Ignore read error
      }
    }

    return links
  },

  buildFixCommand(link: JunctionLink, newTargetWorktree: WorktreeNode): string {
    const pkg = safeToken(link.packageName)
    if (!pkg) {
      return `# Unsafe module name "${commentSafe(link.packageName)}" in go.mod: review the replace directive manually`
    }
    const target =
      safeToken(newTargetWorktree.worktreePath) ?? quoteArg(newTargetWorktree.worktreePath)
    return `go mod edit -replace=${pkg}=${target}`
  },
}
