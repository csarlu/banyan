import {
  EcosystemId,
  JunctionLink,
  LinkMechanism,
  SharedEnvInfo,
  WorkspaceConfig,
  WorktreeNode,
} from '../types.js'
import { EcosystemAdapter } from './types.js'
import { nodeAdapter } from './nodeAdapter.js'
import { pythonAdapter } from './pythonAdapter.js'
import { goAdapter } from './goAdapter.js'
import { rustAdapter } from './rustAdapter.js'
import { dotnetAdapter } from './dotnetAdapter.js'
import { rawSourceAdapter } from './rawSourceAdapter.js'

export const LANGUAGE_ADAPTERS: EcosystemAdapter[] = [
  nodeAdapter,
  pythonAdapter,
  goAdapter,
  rustAdapter,
  dotnetAdapter,
]

export const ALL_ADAPTERS: EcosystemAdapter[] = [...LANGUAGE_ADAPTERS, rawSourceAdapter]

const ADAPTER_BY_ID = new Map<EcosystemId, EcosystemAdapter>(ALL_ADAPTERS.map((a) => [a.id, a]))

export function getAdapterById(id?: EcosystemId): EcosystemAdapter {
  if (id && ADAPTER_BY_ID.has(id)) {
    return ADAPTER_BY_ID.get(id)!
  }
  return nodeAdapter
}

export function getEcosystemIcon(id?: EcosystemId): string {
  switch (id) {
    case 'go':
      return '\ue627' // 
    case 'rust':
      return '\ue7a8' // 
    case 'python':
      return '\ue606' // 
    case 'node':
      return '\ue718' // 
    case 'dotnet':
      return '\ue77f' // 
    case 'raw':
      return '\ue612' // 
    default:
      return '\ue612'
  }
}

export function getEcosystemColor(id?: EcosystemId): string {
  switch (id) {
    case 'go':
      return '#00ADD8'
    case 'rust':
      return '#DEA584'
    case 'python':
      return '#3572A5'
    case 'node':
      return '#68A063'
    case 'dotnet':
      return '#A174F8'
    case 'raw':
      return '#8A9099'
    default:
      return '#8A9099'
  }
}

export function getEcosystemAnsiColor(id?: EcosystemId): string {
  switch (id) {
    case 'go':
      return '\x1b[36m'
    case 'rust':
      return '\x1b[33m'
    case 'python':
      return '\x1b[34m'
    case 'node':
      return '\x1b[32m'
    case 'dotnet':
      return '\x1b[35m'
    case 'raw':
      return '\x1b[90m'
    default:
      return '\x1b[37m'
  }
}

export function getMechanismLabel(mechanism?: LinkMechanism): string {
  switch (mechanism) {
    case 'go-mod-replace':
      return 'go.mod replace'
    case 'cargo-path':
      return 'cargo path'
    case 'pip-editable':
      return 'pip -e'
    case 'dotnet-projref':
      return 'ProjectReference'
    case 'fs-junction':
      return 'junction'
    case 'tsconfig-path':
      return 'tsconfig path'
    case 'pythonpath-override':
      return 'pythonpath'
    case 'source-symlink':
      return 'source symlink'
    default:
      return mechanism || 'link'
  }
}

export function getEcosystemBadgeLabel(id: EcosystemId, withIcon: boolean = true): string {
  const icon = withIcon ? `${getEcosystemIcon(id)} ` : ''
  switch (id) {
    case 'go':
      return `${icon}Go`
    case 'rust':
      return `${icon}Rust`
    case 'python':
      return `${icon}Py`
    case 'node':
      return `${icon}Node`
    case 'dotnet':
      return `${icon}.NET`
    case 'raw':
      return `${icon}Raw`
  }
}

export interface RepoEcosystemInfo {
  repoAlias: string
  isHomogeneous: boolean
  ecosystems: EcosystemId[]
  icons: string[]
}

/**
 * Groups worktrees by repository and determines whether all worktrees
 * share the exact same technology stack (homogeneous) or diverge (heterogeneous).
 */
export function computeRepoEcosystemMap(worktrees: WorktreeNode[]): Map<string, RepoEcosystemInfo> {
  const map = new Map<string, RepoEcosystemInfo>()
  const grouped = new Map<string, WorktreeNode[]>()

  for (const wt of worktrees) {
    const list = grouped.get(wt.repoAlias) || []
    list.push(wt)
    grouped.set(wt.repoAlias, list)
  }

  for (const [repoAlias, wts] of grouped.entries()) {
    const nonBare = wts.filter((w) => !w.isBare)
    const targetWts = nonBare.length > 0 ? nonBare : wts

    const sigs = targetWts.map((w) => (w.detectedEcosystems ?? []).slice().sort().join(','))

    const isHomogeneous = sigs.every((s) => s === sigs[0])
    const ecosystems = isHomogeneous
      ? (targetWts[0]?.detectedEcosystems ?? [])
      : Array.from(new Set(targetWts.flatMap((w) => w.detectedEcosystems ?? [])))

    map.set(repoAlias, {
      repoAlias,
      isHomogeneous,
      ecosystems,
      icons: ecosystems.map((e) => getEcosystemIcon(e)),
    })
  }

  return map
}

export async function enrichWorktreesWithEcosystems(worktrees: WorktreeNode[]): Promise<void> {
  await Promise.all(
    worktrees.map(async (wt) => {
      if (wt.isBare) {
        wt.detectedEcosystems = []
        wt.sharedEnvs = []
        return
      }

      const detected: EcosystemId[] = []
      const sharedEnvs: SharedEnvInfo[] = []

      await Promise.all(
        LANGUAGE_ADAPTERS.map(async (adapter) => {
          const isDetected = await adapter.detect(wt.worktreePath)
          if (isDetected) {
            detected.push(adapter.id)
            const envInfo = await adapter.inspectSharedEnv(wt.worktreePath, worktrees)
            if (envInfo) {
              sharedEnvs.push(envInfo)
            }
          }
        }),
      )

      // Sort in canonical LANGUAGE_ADAPTERS order for deterministic rendering
      const order = LANGUAGE_ADAPTERS.map((a) => a.id)
      detected.sort((a, b) => order.indexOf(a) - order.indexOf(b))
      sharedEnvs.sort((a, b) => order.indexOf(a.ecosystem) - order.indexOf(b.ecosystem))

      wt.detectedEcosystems = detected
      wt.sharedEnvs = sharedEnvs
    }),
  )
}

export async function scanAllAdapterLinks(
  worktrees: WorktreeNode[],
  config: WorkspaceConfig,
): Promise<JunctionLink[]> {
  // Ensure worktrees have detectedEcosystems populated even if called standalone
  const needsEnrich = worktrees.some((wt) => !wt.isBare && !wt.detectedEcosystems)
  if (needsEnrich) {
    await enrichWorktreesWithEcosystems(worktrees)
  }

  const perWorktreeLinks = await Promise.all(
    worktrees
      .filter((wt) => !wt.isBare)
      .map(async (wt) => {
        const activeEcosystems = new Set(wt.detectedEcosystems ?? [])
        const adaptersToRun = ALL_ADAPTERS.filter(
          (a) => a.id === 'raw' || activeEcosystems.has(a.id),
        )

        const perAdapterResults = await Promise.allSettled(
          adaptersToRun.map((adapter) => adapter.scanLinks(wt, worktrees, config)),
        )

        const wtLinks: JunctionLink[] = []
        for (const res of perAdapterResults) {
          if (res.status === 'fulfilled' && res.value.length > 0) {
            wtLinks.push(...res.value)
          }
        }

        wtLinks.sort((a, b) =>
          `${a.packageName}::${a.mechanism ?? ''}::${a.linkPath}`.localeCompare(
            `${b.packageName}::${b.mechanism ?? ''}::${b.linkPath}`,
          ),
        )
        return wtLinks
      }),
  )

  return perWorktreeLinks.flat()
}

export { nodeAdapter, pythonAdapter, goAdapter, rustAdapter, dotnetAdapter, rawSourceAdapter }
