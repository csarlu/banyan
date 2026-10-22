import React from 'react'
import path from 'node:path'
import { Box, Text } from 'ink'
import { EcosystemSnapshot, WorktreeNode } from '../../core/types.js'
import {
  computeRepoEcosystemMap,
  getEcosystemBadgeLabel,
  getEcosystemColor,
  getEcosystemIcon,
  getMechanismLabel,
} from '../../core/adapters/index.js'
import { ThemePalette } from '../theme.js'
import { DICTIONARIES, Locale } from '../../i18n/index.js'
import { computeVisibleWindow } from '../utils/viewportWindow.js'
import {
  fitCell,
  formatShortPath,
  formatWorktreeIdString,
  formatWorktreeLabel,
  parseGitGraphLine,
  sanitizeSingleWidth,
  UI_ICONS,
  wrapCellLines,
} from '../utils/formatters.js'
import { WorktreeFilterMode } from '../utils/searchFilter.js'

interface Props {
  snapshot: EcosystemSnapshot
  selectedIndex: number
  activePanel?: 'left' | 'right'
  theme: ThemePalette
  locale: Locale
  terminalRows?: number
  terminalColumns?: number
  isNarrow?: boolean
  filterMode?: WorktreeFilterMode
  searchQuery?: string
  isSearchActive?: boolean
  filteredWorktrees?: WorktreeNode[]
  expandNames?: boolean
}

export const WorktreeTab: React.FC<Props> = ({
  snapshot,
  selectedIndex,
  activePanel = 'left',
  theme,
  locale,
  terminalRows = 24,
  terminalColumns = 120,
  isNarrow = false,
  filterMode = 'all',
  searchQuery = '',
  isSearchActive = false,
  filteredWorktrees,
  expandNames = false,
}) => {
  const t = DICTIONARIES[locale].wtTab
  const worktrees = filteredWorktrees ?? snapshot.worktrees
  const selectedWt: WorktreeNode | undefined = worktrees[selectedIndex]

  const outgoingLinks = snapshot.junctions.filter((j) => j.sourceWorktreeId === selectedWt?.id)
  const incomingLinks = snapshot.junctions.filter((j) => j.targetWorktreeId === selectedWt?.id)

  // Exact integer box geometry to prevent Yoga fractional rounding & border sawtooth
  const totalWidth = Math.max(60, terminalColumns - 2)
  const gap = isNarrow ? 0 : 2
  const leftBoxWidth = isNarrow ? totalWidth : Math.floor((totalWidth - gap) * 0.48)
  const rightBoxWidth = isNarrow ? totalWidth : totalWidth - gap - leftBoxWidth

  // Usable character columns inside each bordered box (2 border chars + 2 paddingX chars)
  const leftInner = Math.max(28, leftBoxWidth - 4)
  const rightInner = Math.max(30, rightBoxWidth - 4)

  // Pre-allocated horizontal column slots for each Worktree row:
  // [prefix: 5] + [nameSlot: nameColWidth + 1] + [branchSlot: branchColWidth + 1] + [statusSlot: statusColWidth] === leftInner
  const prefixColWidth = 5
  const statusColWidth = Math.min(20, Math.max(13, Math.floor(leftInner * 0.32)))
  const remainingForNameAndBranch = Math.max(12, leftInner - prefixColWidth - statusColWidth - 2)
  const nameColWidth = Math.max(8, Math.floor(remainingForNameAndBranch * 0.56))
  const branchColWidth = Math.max(4, remainingForNameAndBranch - nameColWidth)

  // Dynamic window calculation for viewport virtualization (reserving headroom for multi-repo group headers)
  const searchBarHeight = isSearchActive || searchQuery ? 2 : 0
  const expandExtraRows = expandNames ? 2 : 0
  const missingBannerRows =
    (snapshot.missingRepos?.length ?? 0) > 0 ? Math.min(3, snapshot.missingRepos!.length) : 0
  const maxRows = Math.max(
    4,
    Math.floor((terminalRows - 13 - searchBarHeight - expandExtraRows - missingBannerRows) * 0.62),
  )
  const { visibleItems, startIndex, endIndex } = computeVisibleWindow(
    worktrees,
    selectedIndex,
    maxRows,
  )

  // Count how many worktrees belong to each repoAlias across the full filtered list
  const repoCounts = React.useMemo(() => {
    const map = new Map<string, number>()
    for (const w of worktrees) {
      map.set(w.repoAlias, (map.get(w.repoAlias) || 0) + 1)
    }
    return map
  }, [worktrees])

  // Compute technology consistency across worktrees per repository
  const repoEcosystemMap = React.useMemo(() => {
    return computeRepoEcosystemMap(worktrees)
  }, [worktrees])

  // Precompute incoming (referenced package) and outgoing (consumer) link counts
  const incomingCountMap = React.useMemo(() => {
    const map = new Map<string, number>()
    for (const j of snapshot.junctions) {
      if (j.targetWorktreeId) {
        map.set(j.targetWorktreeId, (map.get(j.targetWorktreeId) || 0) + 1)
      }
    }
    return map
  }, [snapshot.junctions])

  const outgoingCountMap = React.useMemo(() => {
    const map = new Map<string, number>()
    for (const j of snapshot.junctions) {
      map.set(j.sourceWorktreeId, (map.get(j.sourceWorktreeId) || 0) + 1)
    }
    return map
  }, [snapshot.junctions])

  // Left Panel Header Line (exact leftInner chars)
  const filterTag =
    filterMode === 'all'
      ? ''
      : filterMode === 'agents'
        ? ` [${UI_ICONS.filter} ${UI_ICONS.agent} Agents]`
        : filterMode === 'collisions'
          ? ` [${UI_ICONS.filter} ${UI_ICONS.warning} Collisions]`
          : ` [${UI_ICONS.filter} ${UI_ICONS.dirty} Dirty]`
  const leftHeaderTitle = `${activePanel === 'left' ? '● ' : ''}${UI_ICONS.worktree} ${t.title}${filterTag}`
  const leftHeaderRight = `${worktrees.length > 0 ? `[${startIndex + 1}-${endIndex}/${worktrees.length}]` : '[0/0]'}${!isNarrow ? ` ${UI_ICONS.repo} ${snapshot.workspaceName}` : ''}`
  const leftHeaderTitleBudget = Math.max(8, leftInner - leftHeaderRight.length - 1)

  // Table Column Header Legend (exact leftInner chars)
  const colHeaderPrefix = ' '.repeat(prefixColWidth)
  const colHeaderName = fitCell(`${UI_ICONS.repo} REPO / WORKTREE`, nameColWidth, 'left') + ' '
  const colHeaderBranch =
    fitCell(
      locale === 'es' ? `${UI_ICONS.branch} RAMA` : `${UI_ICONS.branch} BRANCH`,
      branchColWidth,
      'left',
    ) + ' '
  const colHeaderStatus = fitCell(
    expandNames
      ? locale === 'es'
        ? `${UI_ICONS.compress} [K:COMPACTO]`
        : `${UI_ICONS.compress} [K:COMPACT]`
      : locale === 'es'
        ? `${UI_ICONS.expand} [K:VER TODO]`
        : `${UI_ICONS.expand} [K:FULL NAME]`,
    statusColWidth,
    'right',
  )

  // Inspector fixed-slot constants
  const inspLabelWidth = 12
  const inspValWidth = Math.max(16, rightInner - inspLabelWidth)

  return (
    <Box
      flexDirection={isNarrow ? 'column' : 'row'}
      gap={gap}
      flexGrow={1}
      width={totalWidth}
      overflow="hidden"
    >
      {/* Panel Izquierdo: Lista de Worktrees con Columnas Pre-Reservadas */}
      <Box
        flexDirection="column"
        width={leftBoxWidth}
        borderStyle="round"
        borderColor={activePanel === 'left' ? theme.borderActive : theme.border}
        paddingX={1}
        overflow="hidden"
      >
        {/* 1. Panel Header */}
        <Text>
          <Text bold color={activePanel === 'left' ? theme.accent : theme.primary}>
            {fitCell(leftHeaderTitle, leftHeaderTitleBudget, 'left')}
          </Text>
          <Text color={theme.muted}>
            {' ' + fitCell(leftHeaderRight, leftHeaderRight.length, 'right')}
          </Text>
        </Text>

        {/* 2. Pre-allocated Column Legend & Separator */}
        <Text>
          <Text color={theme.muted}>{colHeaderPrefix}</Text>
          <Text color={theme.muted} bold>
            {colHeaderName}
          </Text>
          <Text color={theme.muted} bold>
            {colHeaderBranch}
          </Text>
          <Text color={expandNames ? theme.accent : theme.secondary} bold>
            {colHeaderStatus}
          </Text>
        </Text>
        <Text color={theme.border}>{'─'.repeat(leftInner)}</Text>

        {/* Optional Search Bar */}
        {(isSearchActive || searchQuery.length > 0) && (
          <Text>
            <Text color={theme.accent} bold>
              {fitCell(
                `${UI_ICONS.search} ${locale === 'es' ? 'Buscar' : 'Search'}: ${searchQuery}${isSearchActive ? '▎' : ''}`,
                leftInner,
                'left',
              )}
            </Text>
          </Text>
        )}

        {/* Missing Configured Repositories Warning Banner */}
        {snapshot.missingRepos && snapshot.missingRepos.length > 0 && (
          <Box flexDirection="column" marginY={0}>
            {snapshot.missingRepos.slice(0, 3).map((mr) => (
              <Text key={mr.alias} color={theme.warning} bold wrap="truncate-end">
                {fitCell(
                  `${UI_ICONS.warning} ${locale === 'es' ? 'REPO NO ENCONTRADO' : 'MISSING REPO'}: [${mr.alias}] ${path.basename(mr.path)} (${locale === 'es' ? 'revisa banyan.config.json' : 'check banyan.config.json'})`,
                  leftInner,
                  'left',
                )}
              </Text>
            ))}
          </Box>
        )}

        {/* 3. Worktree Rows */}
        {worktrees.length === 0 ? (
          <Text color={theme.warning}>{fitCell(t.empty, leftInner, 'left')}</Text>
        ) : (
          visibleItems.map((wt, localIdx) => {
            const globalIdx = startIndex + localIdx
            const isSelected = globalIdx === selectedIndex
            const prevWt = localIdx > 0 ? visibleItems[localIdx - 1] : undefined
            const nextWt = worktrees[globalIdx + 1]
            const isFirstInRepoView = !prevWt || prevWt.repoAlias !== wt.repoAlias
            const isLastInRepo = !nextWt || nextWt.repoAlias !== wt.repoAlias
            const repoTotal = repoCounts.get(wt.repoAlias) || 1
            const prevRepoTotal = prevWt ? repoCounts.get(prevWt.repoAlias) || 1 : 1

            const hasWarning = snapshot.warnings.some((w) => w.affectedWorktreeIds.includes(wt.id))
            const repoInfo = repoEcosystemMap.get(wt.repoAlias)
            const isHomogeneous = repoInfo?.isHomogeneous ?? true
            const repoEcosystems = repoInfo?.ecosystems ?? []

            // Show ecosystem icon on row if standalone or heterogeneous; otherwise lift to repo group header
            const showIconOnTree = repoTotal === 1 || !isHomogeneous
            const wtEcosystems = wt.detectedEcosystems ?? []
            const sharedEnvsList = (wt.sharedEnvs ?? []).filter((e) => e.type === 'shared')
            const incomingCount = incomingCountMap.get(wt.id) || 0
            const outgoingCount = outgoingCountMap.get(wt.id) || 0

            const displayLabel = formatWorktreeLabel(wt)
            const subLabel =
              repoTotal > 1 && displayLabel.startsWith(`${wt.repoAlias}:`)
                ? displayLabel.slice(wt.repoAlias.length + 1)
                : displayLabel

            // Strict 5-char prefix slot (2-char cursor + 3-char tree glyph)
            const cursorGlyph = isSelected ? '❯ ' : '  '
            const treeGlyph = repoTotal === 1 ? `${UI_ICONS.fork}  ` : isLastInRepo ? '└─ ' : '├─ '
            const prefixSlot = `${cursorGlyph}${treeGlyph}` // exact 5 chars

            const glyphColor = isSelected
              ? theme.accent
              : repoTotal === 1
                ? theme.secondary
                : theme.border

            // Strict nameColWidth + 1 slot with colored Devicon glyphs + trimmed name
            const activeRowEcos = showIconOnTree ? wtEcosystems : []
            const iconCharsCount = activeRowEcos.length * 2 // each icon is 1 BMP char + 1 space
            const maxSubLen = Math.max(2, nameColWidth - 2 - iconCharsCount)
            const cleanSub = sanitizeSingleWidth(subLabel)
            const trimmedSub =
              cleanSub.length > maxSubLen
                ? maxSubLen <= 2
                  ? cleanSub.slice(0, maxSubLen)
                  : cleanSub.slice(0, maxSubLen - 2) + '..'
                : cleanSub
            const usedNameWidth = 2 + iconCharsCount + trimmedSub.length
            const nameTrailingPad = ' '.repeat(Math.max(0, nameColWidth - usedNameWidth) + 1)

            // Strict branchColWidth + 1 slot with branch icon + trimmed branch name
            const branchMaxText = Math.max(2, branchColWidth - 2) // 2 chars for " "
            const trimmedBranch = fitCell(wt.branch, branchMaxText, 'left')

            // Build per-badge colored tokens for the right-aligned status slot (exact statusColWidth chars)
            // IMPORTANT: The trailing separator space is placed INSIDE each badge's own `<Text color={seg.color}>`
            // so wide Nerd Font glyphs (like `` warning) never bleed their right overhang into the next badge's color!
            const badgeSegments: Array<{ text: string; color: string; bold?: boolean }> = []
            if (incomingCount > 0) {
              badgeSegments.push({
                text: `${UI_ICONS.pkg}${incomingCount > 1 ? `:${incomingCount}` : ' ref'}`,
                color: theme.accent,
                bold: true,
              })
            } else if (outgoingCount > 0) {
              badgeSegments.push({
                text: `↳${outgoingCount > 1 ? `:${outgoingCount}` : ' dep'}`,
                color: theme.secondary,
              })
            }
            if (sharedEnvsList.length > 0) {
              const envShort = sharedEnvsList
                .map((e) => (e.envName === 'node_modules' ? 'nm' : e.envName.replace(/^\./, '')))
                .join(',')
              badgeSegments.push({ text: `${UI_ICONS.link}${envShort}`, color: theme.accent })
            } else if (wt.nodeModulesType === 'shared') {
              badgeSegments.push({ text: `${UI_ICONS.link}nm`, color: theme.accent })
            }
            if (wt.agentStatus.isActive) {
              badgeSegments.push({ text: `${UI_ICONS.agent}`, color: theme.agent, bold: true })
            }
            if (hasWarning) {
              badgeSegments.push({ text: `${UI_ICONS.warning}`, color: theme.critical, bold: true })
            }
            badgeSegments.push({
              text: wt.dirtyCount === 0 ? `${UI_ICONS.check}` : `${UI_ICONS.dirty}${wt.dirtyCount}`,
              color: wt.dirtyCount === 0 ? theme.success : theme.warning,
              bold: wt.dirtyCount > 0,
            })
            if (wt.ahead > 0 || wt.behind > 0) {
              badgeSegments.push({
                text: `↑${wt.ahead}↓${wt.behind}`,
                color: theme.secondary,
              })
            }

            // Fit badgeSegments into exact statusColWidth chars
            const fittedBadges = badgeSegments.slice()
            const measureBadges = (arr: typeof badgeSegments) =>
              arr.reduce((sum, seg, i) => sum + seg.text.length + (i < arr.length - 1 ? 1 : 0), 0)
            while (fittedBadges.length > 1 && measureBadges(fittedBadges) > statusColWidth) {
              fittedBadges.shift()
            }
            const badgesUsedLen = measureBadges(fittedBadges)
            const badgesLeftPad = ' '.repeat(Math.max(0, statusColWidth - badgesUsedLen))

            // Multi-repo group header & divider lines (exact leftInner chars)
            const showMultiRepoHeader = isFirstInRepoView && repoTotal > 1
            const showAfterMultiDivider = isFirstInRepoView && repoTotal === 1 && prevRepoTotal > 1

            const repoHeaderEcoChars = repoEcosystems.length * 2
            const maxRepoHeaderAlias = expandNames
              ? Math.max(10, leftInner - 18 - repoHeaderEcoChars)
              : Math.min(18, Math.max(8, Math.floor(leftInner * 0.34)))
            const cleanRepoAlias = sanitizeSingleWidth(wt.repoAlias)
            const trimmedRepoAlias =
              cleanRepoAlias.length > maxRepoHeaderAlias
                ? cleanRepoAlias.slice(0, maxRepoHeaderAlias - 2) + '..'
                : cleanRepoAlias
            const headerLeftPrefix = '── ' // 3 chars
            const headerForkPrefix = `${UI_ICONS.repo} ` // 2 chars
            const headerCountLabel = ` (${repoTotal})${!isHomogeneous ? ' [multi]' : ''} `
            const headerDashesCount = Math.max(
              2,
              leftInner -
                headerLeftPrefix.length -
                headerForkPrefix.length -
                repoHeaderEcoChars -
                trimmedRepoAlias.length -
                headerCountLabel.length,
            )
            const headerDashes = '─'.repeat(headerDashesCount)

            const textColor = isSelected ? theme.accent : repoTotal === 1 ? theme.text : theme.muted

            return (
              <React.Fragment key={wt.id}>
                {showMultiRepoHeader && (
                  <Text>
                    <Text color={theme.border}>{headerLeftPrefix}</Text>
                    <Text color={theme.secondary} bold>
                      {headerForkPrefix}
                    </Text>
                    {repoEcosystems.map((eco) => (
                      <Text key={`hdr-eco-${eco}`} color={getEcosystemColor(eco)} bold>
                        {`${getEcosystemIcon(eco)} `}
                      </Text>
                    ))}
                    <Text color={theme.secondary} bold>
                      {trimmedRepoAlias}
                    </Text>
                    <Text color={theme.muted}>{headerCountLabel}</Text>
                    <Text color={theme.border}>{headerDashes}</Text>
                  </Text>
                )}
                {showAfterMultiDivider && <Text color={theme.border}>{'─'.repeat(leftInner)}</Text>}

                <Text>
                  <Text color={glyphColor}>{prefixSlot}</Text>
                  <Text bold={isSelected || repoTotal === 1} color={textColor}>
                    {'['}
                  </Text>
                  {activeRowEcos.map((eco) => (
                    <Text key={`row-eco-${wt.id}-${eco}`} color={getEcosystemColor(eco)} bold>
                      {`${getEcosystemIcon(eco)} `}
                    </Text>
                  ))}
                  <Text bold={isSelected || repoTotal === 1} color={textColor}>
                    {`${trimmedSub}]${nameTrailingPad}`}
                  </Text>
                  <Text color={isSelected ? theme.accent : theme.muted}>
                    {`${UI_ICONS.branch} `}
                  </Text>
                  <Text bold={isSelected} color={isSelected ? theme.secondary : theme.primary}>
                    {`${trimmedBranch} `}
                  </Text>
                  <Text>{badgesLeftPad}</Text>
                  {fittedBadges.map((seg, sIdx) => {
                    const isLast = sIdx === fittedBadges.length - 1
                    // Trailing space is kept INSIDE seg's own color span to prevent right-half glyph color bleed!
                    return (
                      <Text key={`b-${wt.id}-${sIdx}`} color={seg.color} bold={seg.bold}>
                        {`${seg.text}${isLast ? '' : ' '}`}
                      </Text>
                    )
                  })}
                </Text>

                {/* Shift+K (expandNames) inline full-name expansion for selected worktree */}
                {expandNames && isSelected && (
                  <>
                    <Text color={theme.accent}>
                      {fitCell(
                        `     └─ ${UI_ICONS.repo} repo: ${wt.repoAlias} │ ${UI_ICONS.worktree} wt: ${wt.id}`,
                        leftInner,
                        'left',
                      )}
                    </Text>
                    <Text color={theme.secondary}>
                      {fitCell(
                        `        ${UI_ICONS.branch} branch: ${wt.branch} │ ${UI_ICONS.commit} sha: ${wt.headSha}`,
                        leftInner,
                        'left',
                      )}
                    </Text>
                  </>
                )}
              </React.Fragment>
            )
          })
        )}
      </Box>

      {/* Panel Derecho: Inspector con Espacio Pre-Reservado por Sección */}
      <Box
        flexDirection="column"
        width={rightBoxWidth}
        borderStyle="round"
        borderColor={activePanel === 'right' ? theme.borderActive : theme.border}
        paddingX={1}
        overflow="hidden"
      >
        {!selectedWt ? (
          <Text color={theme.muted}>{fitCell(t.select, rightInner, 'left')}</Text>
        ) : (
          (() => {
            const ecoBadges = (selectedWt.detectedEcosystems ?? [])
              .map((e) => getEcosystemBadgeLabel(e, true))
              .join(', ')
            const inspHeaderLeft = `${activePanel === 'right' ? '● ' : ''}${UI_ICONS.inspector} ${t.inspector}: [${formatWorktreeLabel(selectedWt)}] (${UI_ICONS.commit} ${selectedWt.headSha})${ecoBadges ? ` [${ecoBadges}]` : ''}`
            const inspHeaderRight = expandNames
              ? `${UI_ICONS.compress} [K:FULL]`
              : `${UI_ICONS.expand} [K:+info]`
            const inspHeaderLeftBudget = Math.max(10, rightInner - inspHeaderRight.length - 1)

            // 1. Role value string
            const roleText =
              incomingLinks.length > 0 && outgoingLinks.length > 0
                ? locale === 'es'
                  ? `${UI_ICONS.pkg} Paquete Referenciado & Consumidor (usado por ${incomingLinks.length}, consume ${outgoingLinks.length})`
                  : `${UI_ICONS.pkg} Referenced Package & Consumer (used by ${incomingLinks.length}, consumes ${outgoingLinks.length})`
                : incomingLinks.length > 0
                  ? locale === 'es'
                    ? `${UI_ICONS.pkg} Paquete Referenciado (usado por ${incomingLinks.length} worktree${incomingLinks.length > 1 ? 's' : ''})`
                    : `${UI_ICONS.pkg} Referenced Package (used by ${incomingLinks.length} worktree${incomingLinks.length > 1 ? 's' : ''})`
                  : outgoingLinks.length > 0
                    ? locale === 'es'
                      ? `${UI_ICONS.consumer} Consumidor (consume ${outgoingLinks.length} paquete${outgoingLinks.length > 1 ? 's' : ''} local${outgoingLinks.length > 1 ? 'es' : ''})`
                      : `${UI_ICONS.consumer} Consumer (consumes ${outgoingLinks.length} local package${outgoingLinks.length > 1 ? 's' : ''})`
                    : locale === 'es'
                      ? `${UI_ICONS.banyan} Proyecto Independiente (sin enlaces cruzados)`
                      : `${UI_ICONS.banyan} Standalone Project (no cross-worktree links)`

            const roleColor =
              incomingLinks.length > 0
                ? theme.accent
                : outgoingLinks.length > 0
                  ? theme.secondary
                  : theme.muted

            // 2. Environment value string (reserved slot)
            const sharedEnvs = selectedWt.sharedEnvs ?? []
            let envText = ''
            let envColor = theme.muted
            if (sharedEnvs.length > 0) {
              const firstShared = sharedEnvs.find((e) => e.type === 'shared')
              if (firstShared) {
                envText = `${UI_ICONS.link} ${firstShared.envName}: ${t.nmShared.trim()} ──▶ ${formatWorktreeIdString(firstShared.targetWorktreeId) || formatShortPath(firstShared.targetRealPath, expandNames)}`
                envColor = theme.accent
              } else {
                const names = sharedEnvs
                  .map((e) => `${e.envName} (${e.type === 'own' ? 'own' : 'none'})`)
                  .join(', ')
                envText = `${UI_ICONS.check} ${names}`
                envColor = sharedEnvs.some((e) => e.type === 'own') ? theme.success : theme.muted
              }
            } else if (selectedWt.nodeModulesType === 'shared') {
              envText = `${UI_ICONS.link} node_modules: ${t.nmShared.trim()} ──▶ ${formatWorktreeIdString(selectedWt.sharedNodeModulesWorktreeId) || formatShortPath(selectedWt.sharedNodeModulesTarget, expandNames)}`
              envColor = theme.accent
            } else if (selectedWt.nodeModulesType === 'own') {
              envText = `${UI_ICONS.check} node_modules: ${t.nmOwn}`
              envColor = theme.success
            } else {
              envText =
                locale === 'es'
                  ? `${UI_ICONS.shield} Aislado / Sin entorno compartido`
                  : `${UI_ICONS.shield} Isolated / No shared root env`
              envColor = theme.muted
            }

            // 3. Agent value string (always reserved slot so height never jumps)
            const agentText = selectedWt.agentStatus.isActive
              ? `${UI_ICONS.agent} ${t.agent.trim()} (${selectedWt.agentStatus.reason}: ${selectedWt.agentStatus.detail})`
              : locale === 'es'
                ? '○ Inactivo (sin agentes operando en este worktree)'
                : '○ Idle (no active agent in this worktree)'
            const agentColor = selectedWt.agentStatus.isActive ? theme.agent : theme.muted

            // 4. Pre-allocated Link slots
            const combinedLinks: Array<{
              isOutgoing: boolean
              dirBadge: string
              ecosystem?: any
              pkgLabel: string
              targetLabel: string
              color: string
            }> = [
              ...outgoingLinks.map((l) => ({
                isOutgoing: true,
                dirBadge: `  ${UI_ICONS.consumer} ${locale === 'es' ? 'consume ' : 'consumes'}`,
                ecosystem: l.ecosystem,
                pkgLabel: `${getEcosystemIcon(l.ecosystem)} ${l.packageName}${l.mechanism ? ` · ${getMechanismLabel(l.mechanism)}` : ''}`,
                targetLabel: l.isBroken
                  ? `──▶ ${UI_ICONS.broken} [BROKEN] ${formatShortPath(l.targetRealPath, expandNames)}`
                  : l.targetWorktreeId
                    ? `──▶ ${UI_ICONS.pkg} [${formatWorktreeIdString(l.targetWorktreeId)}] (${UI_ICONS.branch} ${l.targetBranch})`
                    : `──▶ ${UI_ICONS.folder} [EXT] ${formatShortPath(l.targetRealPath, expandNames)}`,
                color: l.isBroken ? theme.critical : theme.success,
              })),
              ...incomingLinks.map((l) => ({
                isOutgoing: false,
                dirBadge: `  ${UI_ICONS.pkg} ${locale === 'es' ? 'usado en' : 'used by '}`,
                ecosystem: l.ecosystem,
                pkgLabel: `${getEcosystemIcon(l.ecosystem)} ${l.packageName}${l.mechanism ? ` · ${getMechanismLabel(l.mechanism)}` : ''}`,
                targetLabel: `◀── ${UI_ICONS.worktree} [${formatWorktreeIdString(l.sourceWorktreeId)}]`,
                color: theme.agent,
              })),
            ]

            // Path lines (1 line in compact mode, up to 2 lines in Shift+K full mode)
            const formattedPath = formatShortPath(selectedWt.worktreePath, expandNames)
            const pathLines = expandNames
              ? wrapCellLines(formattedPath, inspValWidth, 0, 2)
              : [fitCell(formattedPath, inspValWidth, 'left')]

            const availRightRows = Math.max(13, terminalRows - 9)
            const LINK_SLOTS = availRightRows >= 20 ? 3 : availRightRows >= 17 ? 2 : 1
            const visibleLinks = combinedLinks.slice(0, LINK_SLOTS)
            const dirColWidth = 13
            const availAfterDir = Math.max(20, rightInner - dirColWidth)
            const maxPkgLen = Math.max(
              14,
              ...visibleLinks.map((item) => sanitizeSingleWidth(item.pkgLabel).length + 2),
            )
            const linkPkgWidth = Math.min(
              availAfterDir - 12,
              Math.min(maxPkgLen, Math.max(14, Math.floor(availAfterDir * 0.46))),
            )
            const linkTargetWidth = Math.max(8, rightInner - dirColWidth - linkPkgWidth)

            // 5. Pre-allocated Git Commit slots (up to 5 rows reserved for rich branched commit graph)
            const COMMIT_SLOTS = Math.max(
              1,
              Math.min(5, availRightRows - 12 - (pathLines.length - 1) - LINK_SLOTS),
            )
            const commits = selectedWt.recentCommits.slice(0, COMMIT_SLOTS)

            return (
              <Box flexDirection="column" width={rightInner} overflow="hidden">
                {/* Slot 1: Header & Divider */}
                <Text>
                  <Text bold color={activePanel === 'right' ? theme.accent : theme.secondary}>
                    {fitCell(inspHeaderLeft, inspHeaderLeftBudget, 'left')}
                  </Text>
                  <Text color={expandNames ? theme.accent : theme.muted} bold={expandNames}>
                    {' ' + fitCell(inspHeaderRight, inspHeaderRight.length, 'right')}
                  </Text>
                </Text>
                <Text color={theme.border}>{'─'.repeat(rightInner)}</Text>

                {/* Slot 2: Fixed-Width Metadata Grid (Repo/WT, Branch, Path, Role, Env, Agent) */}
                <Text>
                  <Text color={theme.muted} bold>
                    {fitCell(`${UI_ICONS.repo} Repo/WT :`, inspLabelWidth)}
                  </Text>
                  <Text color={theme.text} bold>
                    {fitCell(
                      `${selectedWt.repoAlias} :: ${formatWorktreeLabel(selectedWt)}`,
                      inspValWidth,
                    )}
                  </Text>
                </Text>
                <Text>
                  <Text color={theme.muted} bold>
                    {fitCell(
                      locale === 'es'
                        ? `${UI_ICONS.branch} Rama    :`
                        : `${UI_ICONS.branch} Branch  :`,
                      inspLabelWidth,
                    )}
                  </Text>
                  <Text color={theme.primary} bold>
                    {fitCell(
                      `${selectedWt.branch} (${selectedWt.dirtyCount === 0 ? `${UI_ICONS.check} clean` : `${UI_ICONS.dirty} ${selectedWt.dirtyCount} dirty`}, ↑${selectedWt.ahead}↓${selectedWt.behind})`,
                      inspValWidth,
                    )}
                  </Text>
                </Text>
                {pathLines.map((pLine, idx) => (
                  <Text key={`path-${idx}`}>
                    <Text color={theme.muted} bold>
                      {fitCell(
                        idx === 0
                          ? locale === 'es'
                            ? `${UI_ICONS.folderOpen} Ruta    :`
                            : `${UI_ICONS.folderOpen} Path    :`
                          : '',
                        inspLabelWidth,
                      )}
                    </Text>
                    <Text color={theme.muted}>{pLine}</Text>
                  </Text>
                ))}
                <Text>
                  <Text color={theme.muted} bold>
                    {fitCell(
                      locale === 'es' ? `${UI_ICONS.tag} Rol     :` : `${UI_ICONS.tag} Role    :`,
                      inspLabelWidth,
                    )}
                  </Text>
                  <Text
                    color={roleColor}
                    bold={incomingLinks.length > 0 || outgoingLinks.length > 0}
                  >
                    {fitCell(roleText, inspValWidth)}
                  </Text>
                </Text>
                <Text>
                  <Text color={theme.muted} bold>
                    {fitCell(
                      locale === 'es'
                        ? `${UI_ICONS.layers} Entorno :`
                        : `${UI_ICONS.layers} Env     :`,
                      inspLabelWidth,
                    )}
                  </Text>
                  <Text color={envColor} bold={envColor === theme.accent}>
                    {fitCell(envText, inspValWidth)}
                  </Text>
                </Text>
                <Text>
                  <Text color={theme.muted} bold>
                    {fitCell(
                      locale === 'es'
                        ? `${UI_ICONS.agent} Agente  :`
                        : `${UI_ICONS.agent} Agent   :`,
                      inspLabelWidth,
                    )}
                  </Text>
                  <Text color={agentColor} bold={selectedWt.agentStatus.isActive}>
                    {fitCell(agentText, inspValWidth)}
                  </Text>
                </Text>

                {/* Slot 3: Pre-Allocated Links Table (Header + 3 Fixed Rows) */}
                <Text color={theme.border}>{'─'.repeat(rightInner)}</Text>
                <Text bold color={theme.warning}>
                  {fitCell(
                    `${UI_ICONS.link} ${t.jnTitle.trim()} (${combinedLinks.length})`,
                    rightInner,
                    'left',
                  )}
                </Text>
                {Array.from({ length: LINK_SLOTS }).map((_, slotIdx) => {
                  const item = visibleLinks[slotIdx]
                  if (!item) {
                    const emptyMsg =
                      slotIdx === 0 && combinedLinks.length === 0
                        ? t.noJn
                        : slotIdx === LINK_SLOTS - 1 && combinedLinks.length > LINK_SLOTS
                          ? `  ... +${combinedLinks.length - LINK_SLOTS} more`
                          : ''
                    return (
                      <Text key={`link-slot-${slotIdx}`} color={theme.muted}>
                        {fitCell(emptyMsg, rightInner, 'left')}
                      </Text>
                    )
                  }
                  return (
                    <Text key={`link-slot-${slotIdx}`}>
                      <Text color={item.isOutgoing ? theme.secondary : theme.agent} bold>
                        {fitCell(item.dirBadge, dirColWidth, 'left')}
                      </Text>
                      <Text color={getEcosystemColor(item.ecosystem)} bold>
                        {fitCell(' ' + item.pkgLabel, linkPkgWidth, 'left')}
                      </Text>
                      <Text color={item.color}>
                        {fitCell(' ' + item.targetLabel, linkTargetWidth, 'left')}
                      </Text>
                    </Text>
                  )
                })}

                {/* Slot 4: Pre-Allocated Colored Git Graph (Header + 5 Fixed Rows) */}
                <Text color={theme.border}>{'─'.repeat(rightInner)}</Text>
                <Text bold color={theme.primary}>
                  {fitCell(`${UI_ICONS.commit} ${t.graph.trim()}`, rightInner, 'left')}
                </Text>
                {Array.from({ length: COMMIT_SLOTS }).map((_, slotIdx) => {
                  const cLine = commits[slotIdx]
                  if (!cLine) {
                    const emptyCommitMsg = slotIdx === 0 && commits.length === 0 ? t.noCommits : ''
                    return (
                      <Text key={`commit-slot-${slotIdx}`} color={theme.muted}>
                        {fitCell(emptyCommitMsg, rightInner, 'left')}
                      </Text>
                    )
                  }

                  const parsed = parseGitGraphLine(cLine)
                  // Pure connector line (e.g. `├─╮` or `├─╯`)
                  if (!parsed.sha && !parsed.subject) {
                    return (
                      <Text key={`commit-slot-${slotIdx}`} color={theme.accent} bold>
                        {fitCell('  ' + parsed.graph, rightInner, 'left')}
                      </Text>
                    )
                  }

                  const graphPart = '  ' + parsed.graph
                  const shaPart = parsed.sha ? `${parsed.sha} ` : ''
                  const maxRefsLen = Math.min(20, Math.floor(rightInner * 0.3))
                  const trimmedRefs = parsed.refs
                    ? parsed.refs.length > maxRefsLen
                      ? parsed.refs.slice(0, maxRefsLen - 3) + '..)'
                      : parsed.refs
                    : ''
                  const refsPart = trimmedRefs ? `${trimmedRefs} ` : ''
                  const usedPrefixLen = graphPart.length + shaPart.length + refsPart.length
                  const subjectBudget = Math.max(4, rightInner - usedPrefixLen)

                  return (
                    <Text key={`commit-slot-${slotIdx}`}>
                      <Text color={theme.accent} bold>
                        {graphPart}
                      </Text>
                      <Text color={theme.warning} bold>
                        {shaPart}
                      </Text>
                      {refsPart ? (
                        <Text color={theme.secondary} bold>
                          {refsPart}
                        </Text>
                      ) : null}
                      <Text color={theme.text}>
                        {fitCell(parsed.subject, subjectBudget, 'left')}
                      </Text>
                    </Text>
                  )
                })}
              </Box>
            )
          })()
        )}
      </Box>
    </Box>
  )
}
