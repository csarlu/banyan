import fs from 'node:fs/promises'
import path from 'node:path'
import { EcosystemSnapshot, WorkspaceConfig } from './types.js'
import { scanAllWorktrees } from './git.js'
import { scanAllJunctions } from './junctions.js'
import { detectCollisions } from './collisions.js'
import { getActiveMuxPaths, getMuxBinaryName } from '../integrations/mux.js'

interface CachedWorkspaceState {
  workspaceName: string
  fingerprint: string
  snapshot: EcosystemSnapshot
}

let cachedState: CachedWorkspaceState | null = null

async function statMtimeSafe(targetPath: string): Promise<string> {
  try {
    const st = await fs.lstat(targetPath)
    return `${st.size}:${Math.floor(st.mtimeMs)}`
  } catch {
    return '0'
  }
}

/**
 * Computes a fast, zero-process filesystem fingerprint (pure Node.js fs.lstat/readdir,
 * 0 git.exe or psmux.exe child processes spawned) to detect whether any repository
 * branch, HEAD, index, worktree list, manifest, or lockfile changed on disk.
 */
async function computeWorkspaceFingerprint(
  workspaceConfig: WorkspaceConfig,
  previousSnapshot?: EcosystemSnapshot | null,
): Promise<string> {
  const parts: string[] = []

  for (const repo of workspaceConfig.repos) {
    const dotGit = path.join(repo.path, '.git')
    parts.push(`repo:${repo.alias}:${await statMtimeSafe(dotGit)}`)
    parts.push(`head:${await statMtimeSafe(path.join(dotGit, 'HEAD'))}`)
    parts.push(`idx:${await statMtimeSafe(path.join(dotGit, 'index'))}`)
    parts.push(`lock:${await statMtimeSafe(path.join(dotGit, 'index.lock'))}`)
    parts.push(`refs:${await statMtimeSafe(path.join(dotGit, 'refs', 'heads'))}`)

    const wtAdminDir = path.join(dotGit, 'worktrees')
    try {
      const wtEntries = await fs.readdir(wtAdminDir)
      wtEntries.sort()
      parts.push(`wtlist:${wtEntries.join(',')}`)
      for (const entry of wtEntries) {
        const entryDir = path.join(wtAdminDir, entry)
        parts.push(
          `wtadm:${entry}:${await statMtimeSafe(path.join(entryDir, 'HEAD'))}:${await statMtimeSafe(
            path.join(entryDir, 'index'),
          )}:${await statMtimeSafe(path.join(entryDir, 'index.lock'))}`,
        )
      }
    } catch {
      parts.push('wtlist:none')
    }
  }

  if (previousSnapshot) {
    for (const wt of previousSnapshot.worktrees) {
      if (wt.isBare) continue
      parts.push(`wtdir:${wt.id}:${await statMtimeSafe(wt.worktreePath)}`)
      for (const rel of [
        'package.json',
        'go.mod',
        'go.work',
        'Cargo.toml',
        '.env',
        '.vscode/settings.json',
        '.claude.lock',
        '.cursor.lock',
        '.agent.lock',
        '.aider.chat.history.md',
        'node_modules',
        '.venv',
        'target',
        'obj',
      ]) {
        const m = await statMtimeSafe(path.join(wt.worktreePath, rel))
        if (m !== '0') {
          parts.push(`f:${wt.id}:${rel}:${m}`)
        }
      }
    }
  }

  return parts.join('|')
}

export async function buildEcosystemSnapshot(
  workspaceName: string,
  workspaceConfig: WorkspaceConfig,
  options?: { skipIfUnchanged?: boolean },
): Promise<EcosystemSnapshot> {
  if (options?.skipIfUnchanged && cachedState && cachedState.workspaceName === workspaceName) {
    const currentFp = await computeWorkspaceFingerprint(workspaceConfig, cachedState.snapshot)
    if (currentFp === cachedState.fingerprint) {
      return cachedState.snapshot
    }
  }

  const activeMuxPaths = await getActiveMuxPaths()
  const worktrees = await scanAllWorktrees(workspaceConfig, activeMuxPaths)
  const junctions = await scanAllJunctions(worktrees, workspaceConfig)
  const warnings = detectCollisions(worktrees, junctions)

  const snapshot: EcosystemSnapshot = {
    workspaceName,
    timestamp: Date.now(),
    muxBackend: getMuxBinaryName(),
    worktrees,
    junctions,
    warnings,
  }

  const fingerprint = await computeWorkspaceFingerprint(workspaceConfig, snapshot)
  cachedState = {
    workspaceName,
    fingerprint,
    snapshot,
  }

  return snapshot
}

/**
 * Compares two ecosystem snapshots semantically, ignoring ephemeral timestamps.
 * Returns true if all business data (worktrees, branches, shas, dirty files,
 * junctions, and collision warnings) are identical.
 */
export function areSnapshotsEquivalent(
  a: EcosystemSnapshot | null | undefined,
  b: EcosystemSnapshot | null | undefined,
): boolean {
  if (a === b) return true
  if (!a || !b) return false

  if (a.workspaceName !== b.workspaceName) return false
  if (a.muxBackend !== b.muxBackend) return false

  // Worktrees comparison (order-independent via ID)
  if (a.worktrees.length !== b.worktrees.length) return false
  const bWtById = new Map(b.worktrees.map((w) => [w.id, w]))
  for (const wa of a.worktrees) {
    const wb = bWtById.get(wa.id)
    if (!wb) return false
    if (
      wa.branch !== wb.branch ||
      wa.headSha !== wb.headSha ||
      wa.isBare !== wb.isBare ||
      wa.dirtyCount !== wb.dirtyCount ||
      wa.ahead !== wb.ahead ||
      wa.behind !== wb.behind ||
      wa.nodeModulesType !== wb.nodeModulesType ||
      wa.sharedNodeModulesTarget !== wb.sharedNodeModulesTarget ||
      wa.agentStatus.isActive !== wb.agentStatus.isActive ||
      wa.agentStatus.reason !== wb.agentStatus.reason ||
      wa.recentCommits.length !== wb.recentCommits.length ||
      wa.recentCommits[0] !== wb.recentCommits[0] ||
      (wa.detectedEcosystems ?? []).join(',') !== (wb.detectedEcosystems ?? []).join(',') ||
      (wa.sharedEnvs ?? [])
        .map((e) => `${e.envName}:${e.type}:${e.targetWorktreeId ?? ''}`)
        .join(',') !==
        (wb.sharedEnvs ?? [])
          .map((e) => `${e.envName}:${e.type}:${e.targetWorktreeId ?? ''}`)
          .join(',')
    ) {
      return false
    }
  }

  // Junctions comparison (order-independent via composite key so multiple links in one manifest file don't collide)
  if (a.junctions.length !== b.junctions.length) return false
  const makeJnKey = (j: EcosystemSnapshot['junctions'][number]) =>
    `${j.sourceWorktreeId}::${j.mechanism ?? 'fs-junction'}::${j.packageName}::${j.linkPath}`
  const bJnByKey = new Map(b.junctions.map((j) => [makeJnKey(j), j]))
  for (const ja of a.junctions) {
    const jb = bJnByKey.get(makeJnKey(ja))
    if (!jb) return false
    if (
      ja.sourceWorktreeId !== jb.sourceWorktreeId ||
      ja.packageName !== jb.packageName ||
      ja.targetRealPath !== jb.targetRealPath ||
      ja.targetBranch !== jb.targetBranch ||
      ja.isBroken !== jb.isBroken ||
      ja.isHighlightedScope !== jb.isHighlightedScope ||
      ja.ecosystem !== jb.ecosystem ||
      ja.mechanism !== jb.mechanism
    ) {
      return false
    }
  }

  // Warnings comparison (order-independent via id)
  if (a.warnings.length !== b.warnings.length) return false
  const bWarnById = new Map(b.warnings.map((w) => [w.id, w]))
  for (const wa of a.warnings) {
    const wb = bWarnById.get(wa.id)
    if (!wb) return false
    if (wa.type !== wb.type || wa.severity !== wb.severity || wa.message !== wb.message) {
      return false
    }
  }

  return true
}
