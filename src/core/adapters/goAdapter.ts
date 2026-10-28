import fs from 'node:fs/promises'
import path from 'node:path'
import { JunctionLink, SharedEnvInfo, WorkspaceConfig, WorktreeNode } from '../types.js'
import { commentSafe, quoteArg, safeToken } from '../shellSafe.js'
import {
  discoverCandidateRoots,
  EcosystemAdapter,
  isIntraWorktreeLink,
  pathExists,
  resolvePathToWorktree,
} from './types.js'

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
    const candidateRoots = await discoverCandidateRoots(worktreePath, 2)
    for (const rootDir of candidateRoots) {
      if (
        (await pathExists(path.join(rootDir, 'go.mod'))) ||
        (await pathExists(path.join(rootDir, 'go.work')))
      ) {
        return true
      }
    }
    return false
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
    const candidateRoots = await discoverCandidateRoots(wtPath, 2)

    for (const candidateRoot of candidateRoots) {
      const goModPath = path.join(candidateRoot, 'go.mod')
      if (await pathExists(goModPath)) {
        try {
          const content = await fs.readFile(goModPath, 'utf-8')
          const replaces = parseGoModReplaces(content)
          const relManifest = path.relative(wtPath, goModPath).replace(/\\/g, '/') || 'go.mod'
          for (const rep of replaces) {
            const resolvedTarget = path.resolve(candidateRoot, rep.targetPath)
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
              manifestFile: relManifest,
            })
          }
        } catch {
          // Ignore read error
        }
      }

      const goWorkPath = path.join(candidateRoot, 'go.work')
      if (await pathExists(goWorkPath)) {
        try {
          const content = await fs.readFile(goWorkPath, 'utf-8')
          const uses = parseGoWorkUses(content)
          const relManifest = path.relative(wtPath, goWorkPath).replace(/\\/g, '/') || 'go.work'
          for (const useDir of uses) {
            const resolvedTarget = path.resolve(candidateRoot, useDir)
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
              manifestFile: relManifest,
            })
          }
        } catch {
          // Ignore read error
        }
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
    if (link.manifestFile && link.manifestFile.includes('/')) {
      return `go mod edit -replace=${pkg}=${target} ${quoteArg(link.manifestFile)}`
    }
    return `go mod edit -replace=${pkg}=${target}`
  },
}
