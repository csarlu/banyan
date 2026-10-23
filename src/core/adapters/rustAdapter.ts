import fs from 'node:fs/promises'
import path from 'node:path'
import { JunctionLink, SharedEnvInfo, WorkspaceConfig, WorktreeNode } from '../types.js'
import { buildFileReplaceCommand } from '../shellSafe.js'
import {
  computeTargetSubpath,
  EcosystemAdapter,
  inspectFolderSharedEnv,
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
    return await pathExists(path.join(worktreePath, 'Cargo.toml'))
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
    const normSelf = path.resolve(wtPath).toLowerCase()

    const candidateFiles = [
      { full: path.join(wtPath, 'Cargo.toml'), rel: 'Cargo.toml' },
      { full: path.join(wtPath, '.cargo', 'config.toml'), rel: '.cargo/config.toml' },
      { full: path.join(wtPath, '.cargo', 'config'), rel: '.cargo/config' },
    ]

    for (const fileInfo of candidateFiles) {
      if (!(await pathExists(fileInfo.full))) continue
      try {
        const content = await fs.readFile(fileInfo.full, 'utf-8')
        const parsedDeps = parseCargoTomlPaths(content)
        for (const dep of parsedDeps) {
          const resolvedTarget = path.resolve(wtPath, dep.targetPath)
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
            packageName: dep.crateName,
            linkPath: fileInfo.full,
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
            manifestFile: fileInfo.rel,
          })
        }
      } catch {
        // Ignore read error
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
