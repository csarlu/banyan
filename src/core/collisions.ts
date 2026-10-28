import path from 'node:path'
import { CollisionWarning, JunctionLink, SharedEnvInfo, WorktreeNode } from './types.js'
import { getAdapterById, rawSourceAdapter } from './adapters/index.js'
import { commentSafe, isExecutableFix, quoteArg, safeToken } from './shellSafe.js'

const isWin = process.platform === 'win32'

function buildRemoveLinkCommand(link: JunctionLink): string {
  if (link.mechanism && link.mechanism !== 'fs-junction' && link.mechanism !== 'source-symlink') {
    return `# Review broken reference "${commentSafe(link.packageName)}" -> "${commentSafe(link.targetRealPath)}" in ${commentSafe(link.manifestFile || link.linkPath)}`
  }
  if (isWin) {
    return `Remove-Item -LiteralPath ${quoteArg(link.linkPath)} -Force`
  }
  return `rm -rf ${quoteArg(link.linkPath)}`
}

function resolveFixCommandForLink(
  link: JunctionLink,
  newTargetWorktree: WorktreeNode,
  includeManifestPath: boolean = false,
): string {
  if (link.mechanism === 'tsconfig-path' || link.mechanism === 'source-symlink') {
    return rawSourceAdapter.buildFixCommand(link, newTargetWorktree)
  }
  const effectiveLink =
    includeManifestPath && link.ecosystem === 'dotnet' && link.linkPath
      ? { ...link, manifestFile: link.linkPath }
      : includeManifestPath && link.ecosystem === 'go' && link.linkPath
        ? { ...link, manifestFile: undefined }
        : link
  const adapter = getAdapterById(effectiveLink.ecosystem)
  const cmd = adapter.buildFixCommand(effectiveLink, newTargetWorktree)
  if (
    includeManifestPath &&
    effectiveLink.ecosystem === 'go' &&
    effectiveLink.linkPath &&
    cmd.startsWith('go mod edit ')
  ) {
    return `${cmd} ${quoteArg(effectiveLink.linkPath)}`
  }
  return cmd
}

function buildMultiConsumerIsolateAndRelinkCommand(
  targetWt: WorktreeNode,
  links: JunctionLink[],
): string {
  const useWin = targetWt.worktreePath.includes('\\')
  const sep = useWin ? '\\' : '/'
  const isolatedDirName = `${targetWt.repoAlias}-isolated`
  const parentDir = useWin
    ? path.win32.dirname(targetWt.worktreePath)
    : path.posix.dirname(targetWt.worktreePath)
  const isolatedPath =
    parentDir && parentDir !== '.'
      ? `${parentDir === '/' ? '' : parentDir}${sep}${isolatedDirName}`
      : `..${sep}${isolatedDirName}`

  const baseRef = safeToken(targetWt.branch) || safeToken(targetWt.headSha) || 'HEAD'
  const branchPrefix = safeToken(targetWt.branch) ? targetWt.branch : targetWt.repoAlias
  const isolatedBranch = `${branchPrefix}-isolated`

  const worktreeAddCmd = `git -C ${quoteArg(targetWt.repoPath)} worktree add -b ${quoteArg(isolatedBranch)} ${quoteArg(isolatedPath)} ${quoteArg(baseRef)}`

  const isolatedWt: WorktreeNode = {
    ...targetWt,
    id: `${targetWt.repoAlias}:${isolatedDirName}`,
    relPath: isolatedDirName,
    worktreePath: isolatedPath,
    branch: isolatedBranch,
    dirtyCount: 0,
    agentStatus: { isActive: false },
  }

  const relinkCmds: string[] = []
  const seenCmds = new Set<string>()
  for (const link of links) {
    const cmd = resolveFixCommandForLink(link, isolatedWt, true)
    if (isExecutableFix(cmd) && !seenCmds.has(cmd)) {
      seenCmds.add(cmd)
      relinkCmds.push(cmd)
    }
  }

  return [worktreeAddCmd, ...relinkCmds].join(' && ')
}

function buildSharedEnvFixCommand(wt: WorktreeNode, env: SharedEnvInfo): string {
  const useWin = wt.worktreePath.includes('\\')
  const envPath = useWin
    ? path.win32.join(wt.worktreePath, env.envName)
    : path.posix.join(wt.worktreePath, env.envName)
  const unlinkCmd = isWin ? `cmd /c rmdir ${quoteArg(envPath)}` : `rm -rf ${quoteArg(envPath)}`

  if (env.ecosystem === 'node') {
    return `${unlinkCmd} && npm install`
  }
  if (env.ecosystem === 'python') {
    return `${unlinkCmd} && python -m venv ${quoteArg(envPath)}`
  }
  const mkdirCmd = isWin ? `mkdir ${quoteArg(envPath)}` : `mkdir -p ${quoteArg(envPath)}`
  return `${unlinkCmd} && ${mkdirCmd}`
}

function buildExternalTargetSnippet(link: JunctionLink): string {
  const normalizedPath = link.targetRealPath.replace(/\\/g, '/')
  const rawBase = path.posix.basename(normalizedPath.replace(/\/+$/, ''))
  const alias = rawBase || link.packageName.replace(/^@[^/]+\//, '') || 'external-repo'
  const snippet = JSON.stringify({
    alias: commentSafe(alias),
    path: commentSafe(normalizedPath),
  })
  return `# banyan.config.json "repos": ${snippet}`
}

export function detectCollisions(
  worktrees: WorktreeNode[],
  junctions: JunctionLink[],
): CollisionWarning[] {
  const warnings: CollisionWarning[] = []
  const wtById = new Map<string, WorktreeNode>(worktrees.map((w) => [w.id, w]))

  // 1. Regla BROKEN_LINK (Critical)
  for (const link of junctions) {
    if (link.isBroken) {
      warnings.push({
        id: `broken:${link.sourceWorktreeId}:${link.packageName}`,
        severity: 'critical',
        type: 'BROKEN_LINK',
        message: `Link "${link.packageName}" in [${link.sourceWorktreeId}] points to a nonexistent path (${link.targetRealPath}).`,
        messageEs: `El enlace "${link.packageName}" en [${link.sourceWorktreeId}] apunta a una ruta inexistente (${link.targetRealPath}).`,
        affectedWorktreeIds: [link.sourceWorktreeId],
        suggestedFixCommand: buildRemoveLinkCommand(link),
      })
    }
  }

  // Agrupar enlaces por targetWorktreeId para detectar contaminación cruzada
  const consumersByTarget = new Map<string, JunctionLink[]>()
  for (const link of junctions) {
    if (!link.isBroken && link.targetWorktreeId) {
      const list = consumersByTarget.get(link.targetWorktreeId) ?? []
      list.push(link)
      consumersByTarget.set(link.targetWorktreeId, list)
    }
  }

  // 2. Regla MULTI_CONSUMER_DIRTY (Critical)
  for (const [targetId, links] of consumersByTarget.entries()) {
    const uniqueSourceWts = Array.from(new Set(links.map((l) => l.sourceWorktreeId))).sort()
    const targetWt = wtById.get(targetId)
    if (!targetWt) continue

    if (uniqueSourceWts.length >= 2 && (targetWt.dirtyCount > 0 || targetWt.agentStatus.isActive)) {
      const stateDesc = targetWt.agentStatus.isActive
        ? 'has an ACTIVE AGENT modifying it'
        : `has ${targetWt.dirtyCount} uncommitted file(s)`
      const stateDescEs = targetWt.agentStatus.isActive
        ? 'tiene un AGENTE ACTIVO modificándolo'
        : `tiene ${targetWt.dirtyCount} archivo(s) sin commitear`

      warnings.push({
        id: `multi-dirty:${targetId}`,
        severity: 'critical',
        type: 'MULTI_CONSUMER_DIRTY',
        message: `Cross-contamination: ${uniqueSourceWts.join(', ')} share a local dependency on [${targetWt.id} (${targetWt.branch})], which ${stateDesc}.`,
        messageEs: `Contaminación cruzada: ${uniqueSourceWts.join(', ')} comparten dependencia local hacia [${targetWt.id} (${targetWt.branch})], el cual ${stateDescEs}.`,
        affectedWorktreeIds: [targetId, ...uniqueSourceWts],
        suggestedFixCommand: buildMultiConsumerIsolateAndRelinkCommand(targetWt, links),
      })
    }
  }

  // 3. Regla universal BRANCH_MISMATCH (Warning)
  // Si las ramas difieren y existe un clon hermano del destino con la misma rama que el origen, siempre es un mismatch
  for (const link of junctions) {
    if (link.isBroken || !link.targetWorktreeId) continue
    const sourceWt = wtById.get(link.sourceWorktreeId)
    const targetWt = wtById.get(link.targetWorktreeId)
    if (!sourceWt || !targetWt) continue

    if (sourceWt.branch && targetWt.branch && sourceWt.branch !== targetWt.branch) {
      const matchingSiblingTarget = worktrees.find(
        (w) =>
          w.repoAlias === targetWt.repoAlias &&
          w.branch === sourceWt.branch &&
          w.id !== targetWt.id,
      )

      if (matchingSiblingTarget) {
        warnings.push({
          id: `mismatch:${link.sourceWorktreeId}:${link.packageName}`,
          severity: 'warning',
          type: 'BRANCH_MISMATCH',
          message: `Branch mismatch: [${sourceWt.id}] (${sourceWt.branch}) consumes [${targetWt.id}] (${targetWt.branch}), while sibling [${matchingSiblingTarget.id}] is on the same branch (${sourceWt.branch}).`,
          messageEs: `Rama desalineada: [${sourceWt.id}] (${sourceWt.branch}) consume [${targetWt.id}] (${targetWt.branch}), existiendo [${matchingSiblingTarget.id}] con su misma rama (${sourceWt.branch}).`,
          affectedWorktreeIds: [sourceWt.id, targetWt.id, matchingSiblingTarget.id],
          suggestedFixCommand: resolveFixCommandForLink(link, matchingSiblingTarget),
        })
      }
    }
  }

  // 4. Regla SHARED_ENV_DIRTY (Warning / Critical cuando dos worktrees comparten .venv, node_modules, target/ con agentes activos)
  for (const wt of worktrees) {
    const envs = wt.sharedEnvs ?? []
    for (const env of envs) {
      if (env.type !== 'shared' || !env.targetWorktreeId) continue
      const hostWt = wtById.get(env.targetWorktreeId)
      if (!hostWt || hostWt.id === wt.id) continue

      const bothActive = wt.agentStatus.isActive && hostWt.agentStatus.isActive
      const anyActiveOrDirty =
        wt.agentStatus.isActive ||
        hostWt.agentStatus.isActive ||
        wt.dirtyCount > 0 ||
        hostWt.dirtyCount > 0

      if (anyActiveOrDirty) {
        warnings.push({
          id: `shared-env:${wt.id}:${env.envName}:${hostWt.id}`,
          severity: bothActive ? 'critical' : 'warning',
          type: 'SHARED_ENV_DIRTY',
          message: `Shared environment (${env.envName}): [${wt.id}] shares ${env.envName} with [${hostWt.id}] while there is agent activity or pending changes.`,
          messageEs: `Entorno compartido (${env.envName}): [${wt.id}] comparte ${env.envName} con [${hostWt.id}] mientras hay actividad o cambios pendientes.`,
          affectedWorktreeIds: [wt.id, hostWt.id],
          suggestedFixCommand: buildSharedEnvFixCommand(wt, env),
        })
      }
    }
  }

  // 5. Regla EXTERNAL_TARGET (Warning informativo)
  for (const link of junctions) {
    if (!link.isBroken && !link.targetWorktreeId) {
      warnings.push({
        id: `external:${link.sourceWorktreeId}:${link.packageName}`,
        severity: 'warning',
        type: 'EXTERNAL_TARGET',
        message: `Package "${link.packageName}" in [${link.sourceWorktreeId}] points to a folder outside the monitored worktrees (${link.targetRealPath}).`,
        messageEs: `El paquete "${link.packageName}" en [${link.sourceWorktreeId}] apunta a una carpeta fuera de los worktrees monitoreados (${link.targetRealPath}).`,
        affectedWorktreeIds: [link.sourceWorktreeId],
        suggestedFixCommand: buildExternalTargetSnippet(link),
      })
    }
  }

  const seenWarnIds = new Set<string>()
  const uniqueWarnings: CollisionWarning[] = []
  for (const w of warnings) {
    if (!seenWarnIds.has(w.id)) {
      seenWarnIds.add(w.id)
      uniqueWarnings.push(w)
    }
  }

  return uniqueWarnings.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === 'critical' ? -1 : 1
    }
    return a.id.localeCompare(b.id)
  })
}
