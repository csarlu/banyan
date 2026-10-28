import fs from 'node:fs/promises'
import path from 'node:path'
import { JunctionLink, SharedEnvInfo, WorkspaceConfig, WorktreeNode } from '../types.js'
import { buildFileReplaceCommand } from '../shellSafe.js'
import {
  computeTargetSubpath,
  discoverCandidateRoots,
  EcosystemAdapter,
  inspectFolderSharedEnv,
  isIntraWorktreeLink,
  pathExists,
  resolveNewTargetPath,
  resolvePathToWorktree,
  resolveReplacementStrings,
} from './types.js'

export interface ParsedCargoPathDep {
  crateName: string
  targetPath: string
}

export function parseCargoTomlPaths(content: string): ParsedCargoPathDep[] {
  const results: ParsedCargoPathDep[] = []
  const cleanLines = content.split(/\r?\n/).map((l) => l.replace(/#.*$/, ''))
  const cleanText = cleanLines.join('\n')

  // 1. Inline table dependencies: my-crate = { ..., path = "../lib-wt", ... }
  const inlineRegex = /([a-zA-Z0-9_-]+)\s*=\s*\{[^}]*\bpath\s*=\s*["']([^"']+)["'][^}]*\}/g
  let match: RegExpExecArray | null
  while ((match = inlineRegex.exec(cleanText)) !== null) {
    results.push({
      crateName: match[1],
      targetPath: match[2].trim(),
    })
  }

  // 2. Section table dependencies: [dependencies.my-crate] or [patch.crates-io.my-crate] followed by path = "..."
  const sectionRegex =
    /\[(?:dependencies|dev-dependencies|build-dependencies|workspace\.dependencies|patch\.[^\]]+)\.([a-zA-Z0-9_-]+)\]([^\[]*)/g
  while ((match = sectionRegex.exec(cleanText)) !== null) {
    const crateName = match[1]
    const body = match[2]
    const pathMatch = body.match(/\bpath\s*=\s*["']([^"']+)["']/)
    if (pathMatch) {
      results.push({
        crateName,
        targetPath: pathMatch[1].trim(),
      })
    }
  }

  // 3. .cargo/config.toml paths = ["../lib-wt"]
  const pathsArrayRegex = /\bpaths\s*=\s*\[([^\]]+)\]/g
  while ((match = pathsArrayRegex.exec(cleanText)) !== null) {
    const inner = match[1]
    const itemRegex = /["']([^"']+)["']/g
    let itemMatch: RegExpExecArray | null
    while ((itemMatch = itemRegex.exec(inner)) !== null) {
      const p = itemMatch[1].trim()
      const base = path.posix.basename(p.replace(/\\/g, '/')) || p
      results.push({
        crateName: base,
        targetPath: p,
      })
    }
  }

  return results
}

export const rustAdapter: EcosystemAdapter = {
  id: 'rust',
  label: 'Rust',

  async detect(worktreePath: string): Promise<boolean> {
    const candidateRoots = await discoverCandidateRoots(worktreePath, 2)
    for (const rootDir of candidateRoots) {
      if (await pathExists(path.join(rootDir, 'Cargo.toml'))) {
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
    return inspectFolderSharedEnv(worktreePath, 'rust', ['target'], 'target', allWorktrees)
  },

  async scanLinks(
    worktree: WorktreeNode,
    allWorktrees: WorktreeNode[],
    config: WorkspaceConfig,
  ): Promise<JunctionLink[]> {
    if (config.adapters?.rust?.enabled === false) return []

    const links: JunctionLink[] = []
    const wtPath = worktree.worktreePath
    const candidateRoots = await discoverCandidateRoots(wtPath, 2)

    for (const candidateRoot of candidateRoots) {
      const candidateFiles = [
        path.join(candidateRoot, 'Cargo.toml'),
        path.join(candidateRoot, '.cargo', 'config.toml'),
        path.join(candidateRoot, '.cargo', 'config'),
      ]

      for (const fullFilePath of candidateFiles) {
        if (!(await pathExists(fullFilePath))) continue
        try {
          const content = await fs.readFile(fullFilePath, 'utf-8')
          const parsedDeps = parseCargoTomlPaths(content)
          const relManifest = path.relative(wtPath, fullFilePath).replace(/\\/g, '/')
          for (const dep of parsedDeps) {
            const resolvedTarget = path.resolve(candidateRoot, dep.targetPath)
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
              packageName: dep.crateName,
              linkPath: fullFilePath,
              targetRealPath,
              rawTarget: dep.targetPath,
              targetSubpath: computeTargetSubpath(targetRealPath, matchedWt),
              targetWorktreeId: matchedWt?.id,
              targetRepoAlias: matchedWt?.repoAlias,
              targetBranch: matchedWt?.branch,
              isBroken: !exists,
              isHighlightedScope: true,
              ecosystem: 'rust',
              mechanism: 'cargo-path',
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
    const manifestPath = link.linkPath || link.manifestFile || 'Cargo.toml'
    const newTarget = resolveNewTargetPath(link, newTargetWorktree)
    const { oldStr, newStr } = resolveReplacementStrings(link, newTargetWorktree)
    const fallback = `Update path = "${newTarget.replace(/\\/g, '/')}" for "${link.packageName}" in ${link.manifestFile || 'Cargo.toml'}`
    return buildFileReplaceCommand(manifestPath, oldStr, newStr, fallback)
  },
}
