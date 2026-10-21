import { EcosystemSnapshot } from './types.js'
import { Locale } from '../i18n/index.js'
import { getMessages, localizeWarningMessage } from '../i18n/messages.js'
import {
  computeRepoEcosystemMap,
  getEcosystemAnsiColor,
  getEcosystemIcon,
  getMechanismLabel,
} from './adapters/index.js'

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  brightGreen: '\x1b[92m',
  yellow: '\x1b[33m',
  brightYellow: '\x1b[93m',
  red: '\x1b[31m',
  brightRed: '\x1b[91m',
  cyan: '\x1b[36m',
  brightCyan: '\x1b[96m',
  magenta: '\x1b[95m',
  gray: '\x1b[90m',
}

export function formatStatusReport(snapshot: EcosystemSnapshot, locale: Locale = 'en'): string {
  const lines: string[] = []
  const m = getMessages(locale).status

  lines.push(
    `🌳 ${C.bold}${C.brightGreen}B A N Y A N${C.reset}  ${C.gray}v1.0.0 · [Workspace: ${snapshot.workspaceName}]${C.reset}`,
  )
  lines.push(`   ${C.cyan}${m.subtitle}${C.reset}`)
  lines.push('')

  lines.push(`${C.bold}⑂ ${m.worktrees} (${snapshot.worktrees.length})${C.reset}`)
  lines.push(`${C.gray}${'─'.repeat(86)}${C.reset}`)

  if (snapshot.worktrees.length === 0) {
    lines.push(`  ${C.yellow}${m.noWorktrees}${C.reset}`)
  } else {
    const repoCounts = new Map<string, number>()
    for (const w of snapshot.worktrees) {
      repoCounts.set(w.repoAlias, (repoCounts.get(w.repoAlias) || 0) + 1)
    }
    const repoEcosystemMap = computeRepoEcosystemMap(snapshot.worktrees)

    let lastRepoAlias = ''
    for (let i = 0; i < snapshot.worktrees.length; i++) {
      const wt = snapshot.worktrees[i]
      const nextWt = snapshot.worktrees[i + 1]
      const repoTotal = repoCounts.get(wt.repoAlias) || 1
      const lastRepoTotal = lastRepoAlias ? repoCounts.get(lastRepoAlias) || 1 : 1

      const repoInfo = repoEcosystemMap.get(wt.repoAlias)
      const isHomogeneous = repoInfo?.isHomogeneous ?? true
      const repoEcosystems = repoInfo?.ecosystems ?? []
      const repoIconsStr =
        repoEcosystems.length > 0
          ? `${repoEcosystems.map((e) => `${getEcosystemAnsiColor(e)}${getEcosystemIcon(e)}${C.reset}`).join(' ')} `
          : ''

      if (wt.repoAlias !== lastRepoAlias) {
        if (repoTotal > 1) {
          if (lastRepoAlias !== '') lines.push('')
          const multiTag = !isHomogeneous ? ` ${C.yellow}[multi]${C.reset}` : ''
          lines.push(
            `  ${C.gray}── ${C.cyan}${C.bold}⑂ ${repoIconsStr}${wt.repoAlias}${C.reset} ${C.gray}(${repoTotal} worktrees)${multiTag} ${'─'.repeat(Math.max(6, 56 - wt.repoAlias.length - repoEcosystems.length * 2))}${C.reset}`,
          )
        } else if (lastRepoTotal > 1) {
          lines.push(`  ${C.gray}${'─'.repeat(84)}${C.reset}`)
        }
        lastRepoAlias = wt.repoAlias
      }

      const isLastInRepo = !nextWt || nextWt.repoAlias !== wt.repoAlias
      const glyph = repoTotal > 1 ? (isLastInRepo ? '└─ ' : '├─ ') : '⑂  '
      const subId =
        repoTotal > 1 && wt.id.startsWith(`${wt.repoAlias}:`)
          ? wt.id.slice(wt.repoAlias.length + 1)
          : wt.id === `${wt.repoAlias}:${wt.repoAlias}`
            ? wt.repoAlias
            : wt.id

      const showIconOnTree = repoTotal === 1 || !isHomogeneous
      const wtEcos = wt.detectedEcosystems ?? []
      const treeEcoIcons = wtEcos
        .map((e) => `${getEcosystemAnsiColor(e)}${getEcosystemIcon(e)}${C.reset}`)
        .join(' ')
      const visibleIconLen = showIconOnTree && wtEcos.length > 0 ? wtEcos.length * 2 : 0
      const padAfterName = Math.max(1, 28 - glyph.length - visibleIconLen - subId.length)
      const idCol = `${glyph}${showIconOnTree && treeEcoIcons ? `${treeEcoIcons} ` : ''}${subId}${' '.repeat(padAfterName)}`
      const branchCol = wt.branch.padEnd(22)
      const gitState =
        wt.dirtyCount === 0
          ? `${C.green}✔ clean${C.reset}`
          : `${C.brightYellow}● ${wt.dirtyCount} dirty${C.reset}`
      const abState =
        wt.ahead > 0 || wt.behind > 0 ? ` ${C.cyan}↑${wt.ahead}↓${wt.behind}${C.reset}` : ''
      const incomingCount = snapshot.junctions.filter((j) => j.targetWorktreeId === wt.id).length
      const outgoingCount = snapshot.junctions.filter((j) => j.sourceWorktreeId === wt.id).length
      const roleBadge =
        incomingCount > 0
          ? ` ${C.magenta}${C.bold}[\uf487 ref${incomingCount > 1 ? `:${incomingCount}` : ''}]${C.reset}`
          : outgoingCount > 0
            ? ` ${C.cyan}[↳ dep${outgoingCount > 1 ? `:${outgoingCount}` : ''}]${C.reset}`
            : ''
      const nmBadge =
        wt.nodeModulesType === 'shared'
          ? ` ${C.brightCyan}[\uf0c1 nm:shared→${wt.sharedNodeModulesWorktreeId || 'ext'}]${C.reset}`
          : wt.nodeModulesType === 'own'
            ? ` ${C.gray}[nm:own]${C.reset}`
            : ''
      const agentBadge = wt.agentStatus.isActive
        ? ` ${C.magenta}${C.bold}[\uf544 AGENT: ${wt.agentStatus.reason}]${C.reset}`
        : ''

      lines.push(
        `  ${C.bold}${idCol}${C.reset} ${C.brightGreen}${branchCol}${C.reset} ${gitState}${abState}${roleBadge}${nmBadge}${agentBadge}`,
      )
    }
  }

  lines.push('')
  lines.push(`${C.bold}\uf0c1 ${m.links} (${snapshot.junctions.length})${C.reset}`)
  lines.push(`${C.gray}${'─'.repeat(86)}${C.reset}`)
  if (snapshot.junctions.length === 0) {
    lines.push(`  ${C.gray}${m.noLinks}${C.reset}`)
  } else {
    for (const j of snapshot.junctions) {
      const src = j.sourceWorktreeId.padEnd(24)
      const ecoIcon = `${getEcosystemAnsiColor(j.ecosystem)}${getEcosystemIcon(j.ecosystem)}${C.reset}`
      const mechStr = j.mechanism ? ` · ${getMechanismLabel(j.mechanism)}` : ''
      const visiblePkgLen = 2 + j.packageName.length + mechStr.length
      const pkgPad = ' '.repeat(Math.max(0, 28 - visiblePkgLen))
      const pkg = `${ecoIcon} ${j.packageName}${mechStr}${pkgPad}`
      const dest = j.isBroken
        ? `${C.brightRed}✖ ${m.broken} (${j.targetRealPath})${C.reset}`
        : j.targetWorktreeId
          ? `${C.brightGreen}◈ \uf487 [${m.localPackage}: ${j.targetWorktreeId}] (${j.targetBranch})${C.reset}`
          : `${C.yellow}\uf07b [${m.external}: ${j.targetRealPath}]${C.reset}`
      lines.push(`  ${src} ${C.cyan}──[${pkg}]──▶${C.reset} ${dest}`)
    }
  }

  lines.push('')
  lines.push(`${C.bold}\uf071 ${m.health} (${snapshot.warnings.length})${C.reset}`)
  lines.push(`${C.gray}${'─'.repeat(86)}${C.reset}`)
  if (snapshot.warnings.length === 0) {
    lines.push(`  ${C.brightGreen}✔ ${m.healthy}${C.reset}`)
  } else {
    for (const w of snapshot.warnings) {
      const icon =
        w.severity === 'critical'
          ? `${C.brightRed}\uf071 ${m.critical}${C.reset}`
          : `${C.brightYellow}\uf071 ${m.warning}${C.reset}`
      lines.push(`  ${icon} ${C.bold}[${w.type}]${C.reset} ${localizeWarningMessage(w, locale)}`)
      if (w.suggestedFixCommand) {
        lines.push(`     ${C.cyan}💡 ${m.fix}: ${w.suggestedFixCommand}${C.reset}`)
      }
    }
  }

  lines.push('')
  return lines.join('\n')
}
