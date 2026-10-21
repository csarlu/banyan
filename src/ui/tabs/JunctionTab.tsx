import React from 'react'
import { Box, Text } from 'ink'
import { EcosystemSnapshot, JunctionLink } from '../../core/types.js'
import {
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
  UI_ICONS,
  wrapCellLines,
} from '../utils/formatters.js'
import { formatWarningMessage } from './HealthTab.js'

interface Props {
  snapshot: EcosystemSnapshot
  selectedIndex?: number
  theme: ThemePalette
  locale: Locale
  terminalRows?: number
  terminalColumns?: number
  isNarrow?: boolean
  searchQuery?: string
  isSearchActive?: boolean
  filteredJunctions?: JunctionLink[]
  expandNames?: boolean
}

export const JunctionTab: React.FC<Props> = ({
  snapshot,
  selectedIndex = 0,
  theme,
  locale,
  terminalRows = 24,
  terminalColumns = 120,
  isNarrow = false,
  searchQuery = '',
  isSearchActive = false,
  filteredJunctions,
  expandNames = false,
}) => {
  const t = DICTIONARIES[locale].jnTab
  const { warnings, worktrees } = snapshot
  const junctions = filteredJunctions ?? snapshot.junctions
  const selectedLink: JunctionLink | undefined = junctions[selectedIndex] || junctions[0]

  const totalWidth = Math.max(60, terminalColumns - 2)
  const gap = isNarrow ? 0 : 2
  const leftBoxWidth = isNarrow ? totalWidth : Math.floor((totalWidth - gap) * 0.56)
  const rightBoxWidth = isNarrow ? totalWidth : totalWidth - leftBoxWidth - gap

  const leftInnerWidth = Math.max(36, leftBoxWidth - 4)
  const rightInnerWidth = Math.max(28, rightBoxWidth - 4)

  const sharedEnvEntries = worktrees.flatMap((wt) => {
    if (wt.sharedEnvs && wt.sharedEnvs.length > 0) {
      return wt.sharedEnvs
        .filter((e) => e.type === 'shared')
        .map((e) => ({
          wtId: wt.id,
          envName: e.envName,
          targetId: e.targetWorktreeId,
          targetPath: e.targetRealPath,
        }))
    }
    if (wt.nodeModulesType === 'shared') {
      return [
        {
          wtId: wt.id,
          envName: 'node_modules',
          targetId: wt.sharedNodeModulesWorktreeId,
          targetPath: wt.sharedNodeModulesTarget,
        },
      ]
    }
    return []
  })

  const visibleSharedEnvs = sharedEnvEntries.slice(0, 2)
  const sharedEnvExtra = sharedEnvEntries.length - visibleSharedEnvs.length

  const searchBarHeight = isSearchActive || searchQuery ? 1 : 0
  const sharedBannerRows =
    sharedEnvEntries.length > 0 ? 2 + visibleSharedEnvs.length + (sharedEnvExtra > 0 ? 1 : 0) : 0
  const chromeHeight = 13 + searchBarHeight + sharedBannerRows
  const maxRows = Math.max(
    4,
    (isNarrow ? Math.floor(terminalRows * 0.55) : terminalRows) - chromeHeight,
  )

  const { visibleItems, startIndex } = computeVisibleWindow(junctions, selectedIndex, maxRows)

  // Left table column math:
  // [cursor: 2] + [srcCol: srcWidth] + ' ' + [pkgCol: pkgWidth] + ' ' + [tgtCol: tgtWidth] === leftInnerWidth
  const usableRowWidth = Math.max(30, leftInnerWidth - 4)
  const srcWidth = Math.max(12, Math.floor(usableRowWidth * 0.3))
  const pkgWidth = Math.max(14, Math.floor(usableRowWidth * 0.36))
  const tgtWidth = Math.max(10, usableRowWidth - srcWidth - pkgWidth)

  const headerRight = `${junctions.length > 0 ? `[${selectedIndex + 1}/${junctions.length}] ` : ''}${junctions.length} links │ ${sharedEnvEntries.length} shared`
  const headerLeftBudget = Math.max(10, leftInnerWidth - headerRight.length - 1)

  const selectedWarnings = selectedLink
    ? warnings.filter(
        (w) =>
          w.affectedWorktreeIds.includes(selectedLink.sourceWorktreeId) &&
          (!selectedLink.targetWorktreeId ||
            w.affectedWorktreeIds.includes(selectedLink.targetWorktreeId)),
      )
    : []

  const sourceWt = selectedLink
    ? worktrees.find((w) => w.id === selectedLink.sourceWorktreeId)
    : undefined
  const targetWt =
    selectedLink && selectedLink.targetWorktreeId
      ? worktrees.find((w) => w.id === selectedLink.targetWorktreeId)
      : undefined

  return (
    <Box
      flexDirection={isNarrow ? 'column' : 'row'}
      gap={gap}
      flexGrow={1}
      width={totalWidth}
      overflow="hidden"
    >
      {/* LEFT PANEL: Polyglot Dependency & Junction Matrix */}
      <Box
        flexDirection="column"
        width={leftBoxWidth}
        borderStyle="round"
        borderColor={theme.borderActive}
        paddingX={1}
        overflow="hidden"
      >
        <Text>
          <Text bold color={theme.primary}>
            {fitCell(`${UI_ICONS.link} ${t.title.trim()}`, headerLeftBudget, 'left')}
          </Text>
          <Text color={theme.muted}>{' ' + fitCell(headerRight, headerRight.length, 'right')}</Text>
        </Text>
        <Text color={theme.border}>{'─'.repeat(leftInnerWidth)}</Text>

        {(isSearchActive || searchQuery.length > 0) && (
          <Text color={theme.accent} bold>
            {fitCell(
              `${UI_ICONS.search} ${locale === 'es' ? 'Filtrar enlaces' : 'Filter links'}: ${searchQuery}${isSearchActive ? '▎' : ''}`,
              leftInnerWidth,
              'left',
            )}
          </Text>
        )}

        {sharedEnvEntries.length > 0 && (
          <>
            <Text bold color={theme.warning}>
              {fitCell(`${UI_ICONS.pkg} ${t.sharedRoots.trim()}`, leftInnerWidth, 'left')}
            </Text>
            {visibleSharedEnvs.map((entry, idx) => {
              const sLeft = fitCell(
                `  ${UI_ICONS.worktree} ${formatWorktreeIdString(entry.wtId)}`,
                srcWidth + 2,
                'left',
              )
              const sMid = fitCell(`──[${entry.envName}/*]──▶`, pkgWidth, 'left')
              const sRight = fitCell(
                entry.targetId
                  ? `◈ ${formatWorktreeIdString(entry.targetId)}`
                  : formatShortPath(entry.targetPath, expandNames) || '',
                tgtWidth,
                'left',
              )
              return (
                <Text key={`shared-env-${entry.wtId}-${entry.envName}-${idx}`}>
                  <Text color={theme.text} bold>
                    {sLeft + ' '}
                  </Text>
                  <Text color={theme.warning}>{sMid + ' '}</Text>
                  <Text color={theme.accent} bold>
                    {sRight}
                  </Text>
                </Text>
              )
            })}
            {sharedEnvExtra > 0 && (
              <Text color={theme.muted}>
                {fitCell(
                  `  ... +${sharedEnvExtra} ${locale === 'es' ? 'raíces compartidas más' : 'more shared roots'}`,
                  leftInnerWidth,
                  'left',
                )}
              </Text>
            )}
            <Text color={theme.border}>{'┄'.repeat(leftInnerWidth)}</Text>
          </>
        )}

        {/* Table Column Headers */}
        <Text>
          <Text color={theme.muted}>{'  '}</Text>
          <Text color={theme.muted} bold>
            {fitCell(
              locale === 'es' ? `${UI_ICONS.worktree} CONSUMIDOR` : `${UI_ICONS.worktree} CONSUMER`,
              srcWidth,
              'left',
            ) + ' '}
          </Text>
          <Text color={theme.muted} bold>
            {fitCell(
              locale === 'es' ? `${UI_ICONS.pkg} PAQUETE LOCAL` : `${UI_ICONS.pkg} LOCAL PACKAGE`,
              pkgWidth,
              'left',
            ) + ' '}
          </Text>
          <Text color={theme.muted} bold>
            {fitCell(
              locale === 'es' ? '◈ PROVEEDOR / ESTADO' : '◈ TARGET / STATUS',
              tgtWidth,
              'left',
            )}
          </Text>
        </Text>
        <Text color={theme.border}>{'─'.repeat(leftInnerWidth)}</Text>

        {junctions.length === 0 ? (
          <Text color={theme.warning}>{fitCell(t.empty, leftInnerWidth, 'left')}</Text>
        ) : (
          visibleItems.map((link, localIdx) => {
            const globalIdx = startIndex + localIdx
            const isSelected = globalIdx === selectedIndex
            const hasCollision = warnings.some(
              (w) =>
                w.affectedWorktreeIds.includes(link.sourceWorktreeId) &&
                (!link.targetWorktreeId || w.affectedWorktreeIds.includes(link.targetWorktreeId)),
            )

            const statusColor = link.isBroken
              ? theme.critical
              : hasCollision
                ? theme.warning
                : theme.success

            const statusGlyph = link.isBroken
              ? UI_ICONS.broken
              : hasCollision
                ? UI_ICONS.warning
                : UI_ICONS.check

            const ecoIcon = getEcosystemIcon(link.ecosystem)
            const ecoColor = getEcosystemColor(link.ecosystem)
            const pkgCell = `${ecoIcon} ${link.packageName}`

            const targetCell = link.isBroken
              ? `${statusGlyph} ${t.broken.trim()} (${formatShortPath(link.targetRealPath, expandNames)})`
              : link.targetWorktreeId
                ? `${statusGlyph} ${formatWorktreeIdString(link.targetWorktreeId)} (${link.targetBranch || '?'})`
                : `${UI_ICONS.folder} ${t.external.trim()}: ${formatShortPath(link.targetRealPath, expandNames)}`

            return (
              <React.Fragment key={`${link.sourceWorktreeId}-${link.packageName}-${localIdx}`}>
                <Text>
                  <Text color={isSelected ? theme.accent : theme.muted} bold={isSelected}>
                    {isSelected ? '❯ ' : '  '}
                  </Text>
                  <Text color={isSelected ? theme.accent : theme.text} bold={isSelected}>
                    {fitCell(formatWorktreeIdString(link.sourceWorktreeId), srcWidth, 'left') + ' '}
                  </Text>
                  <Text color={ecoColor} bold={isSelected || link.isHighlightedScope}>
                    {fitCell(pkgCell, pkgWidth, 'left') + ' '}
                  </Text>
                  <Text color={statusColor} bold={isSelected || link.isBroken}>
                    {fitCell(targetCell, tgtWidth, 'left')}
                  </Text>
                </Text>
                {expandNames && isSelected && (
                  <Text color={theme.accent}>
                    {fitCell(
                      `  └─ ${link.sourceWorktreeId} ──▶ ${link.packageName} ──▶ ${link.targetWorktreeId || link.targetRealPath}`,
                      leftInnerWidth,
                      'left',
                    )}
                  </Text>
                )}
              </React.Fragment>
            )
          })
        )}
      </Box>

      {/* RIGHT PANEL: Live Link & Manifest Inspector */}
      <Box
        flexDirection="column"
        width={rightBoxWidth}
        borderStyle="round"
        borderColor={
          !selectedLink
            ? theme.border
            : selectedLink.isBroken
              ? theme.critical
              : selectedWarnings.length > 0
                ? theme.warning
                : theme.borderActive
        }
        paddingX={1}
        overflow="hidden"
      >
        {!selectedLink ? (
          <Text color={theme.muted}>{fitCell(t.empty, rightInnerWidth, 'left')}</Text>
        ) : (
          <>
            {/* Inspector Title */}
            {(() => {
              const ecoIcon = getEcosystemIcon(selectedLink.ecosystem)
              const ecoColor = getEcosystemColor(selectedLink.ecosystem)
              const rightTitle = locale === 'es' ? 'Inspector de Enlace' : 'Link Inspector'
              const mechBadge = getMechanismLabel(selectedLink.mechanism)
              const leftBudget = Math.max(10, rightInnerWidth - mechBadge.length - 3)
              return (
                <Text>
                  <Text bold color={theme.primary}>
                    {fitCell(
                      `${UI_ICONS.bolt} ${rightTitle}: ${selectedLink.packageName}`,
                      leftBudget,
                      'left',
                    )}
                  </Text>
                  <Text color={ecoColor} bold>
                    {' ' + fitCell(`${ecoIcon} ${mechBadge}`, mechBadge.length + 2, 'right')}
                  </Text>
                </Text>
              )
            })()}
            <Text color={theme.border}>{'─'.repeat(rightInnerWidth)}</Text>

            {/* 1. Health & Branch Alignment Status Banner */}
            {(() => {
              if (selectedLink.isBroken) {
                return (
                  <Text color={theme.critical} bold>
                    {fitCell(
                      `${UI_ICONS.broken} ${locale === 'es' ? 'ENLACE ROTO · Ruta destino no existe en disco' : 'BROKEN LINK · Target path missing on disk'}`,
                      rightInnerWidth,
                      'left',
                    )}
                  </Text>
                )
              }
              if (selectedWarnings.length > 0) {
                return (
                  <Text color={theme.warning} bold>
                    {fitCell(
                      `${UI_ICONS.warning} ${locale === 'es' ? `ALERTA DE AISLAMIENTO (${selectedWarnings.length} colisión activa)` : `ISOLATION ALERT (${selectedWarnings.length} active collision)`}`,
                      rightInnerWidth,
                      'left',
                    )}
                  </Text>
                )
              }
              return (
                <Text color={theme.success} bold>
                  {fitCell(
                    `${UI_ICONS.shield} ${UI_ICONS.check} ${locale === 'es' ? 'ENLACE SALUDABLE Y RAMAS ALINEADAS' : 'HEALTHY LINK & ALIGNED BRANCHES'}`,
                    rightInnerWidth,
                    'left',
                  )}
                </Text>
              )
            })()}

            <Text color={theme.border}>{'┄'.repeat(rightInnerWidth)}</Text>

            {/* 2. Visual Topology Flow Diagram */}
            <Text color={theme.secondary} bold>
              {fitCell(
                `${UI_ICONS.worktree} ${locale === 'es' ? '1. Worktree Consumidor (Origen):' : '1. Consumer Worktree (Source):'}`,
                rightInnerWidth,
                'left',
              )}
            </Text>
            <Text color={theme.text} bold>
              {fitCell(
                `   ◈ [${formatWorktreeIdString(selectedLink.sourceWorktreeId)}]  ${UI_ICONS.branch} ${sourceWt?.branch || 'HEAD'}`,
                rightInnerWidth,
                'left',
              )}
            </Text>
            <Text color={theme.muted}>
              {fitCell(
                `   ${UI_ICONS.folder} ${formatShortPath(selectedLink.linkPath, expandNames)}`,
                rightInnerWidth,
                'left',
              )}
            </Text>

            {/* Pipe connector */}
            {terminalRows >= 32 && (
              <Text color={getEcosystemColor(selectedLink.ecosystem)} bold>
                {fitCell(`   │`, rightInnerWidth, 'left')}
              </Text>
            )}
            <Text color={getEcosystemColor(selectedLink.ecosystem)} bold>
              {fitCell(
                `   ╰──▶ ${getEcosystemIcon(selectedLink.ecosystem)} ${selectedLink.packageName}  [${getMechanismLabel(selectedLink.mechanism)}]`,
                rightInnerWidth,
                'left',
              )}
            </Text>
            {terminalRows >= 32 && (
              <Text color={getEcosystemColor(selectedLink.ecosystem)} bold>
                {fitCell(`   │`, rightInnerWidth, 'left')}
              </Text>
            )}

            {/* Target Provider */}
            <Text color={theme.secondary} bold>
              {fitCell(
                `${UI_ICONS.pkg} ${locale === 'es' ? '2. Paquete Proveedor (Destino Real):' : '2. Target Provider (Real Path):'}`,
                rightInnerWidth,
                'left',
              )}
            </Text>
            <Text
              color={
                selectedLink.isBroken
                  ? theme.critical
                  : selectedWarnings.length > 0
                    ? theme.warning
                    : theme.success
              }
              bold
            >
              {fitCell(
                selectedLink.isBroken
                  ? `   ${UI_ICONS.broken} [${t.broken.trim()}]`
                  : selectedLink.targetWorktreeId
                    ? `   ◈ [${formatWorktreeIdString(selectedLink.targetWorktreeId)}]  ${UI_ICONS.branch} ${selectedLink.targetBranch || '?'}`
                    : `   ${UI_ICONS.folder} [${t.external.trim()}]`,
                rightInnerWidth,
                'left',
              )}
            </Text>
            <Text color={theme.muted}>
              {fitCell(
                `   ${UI_ICONS.folder} ${formatShortPath(selectedLink.targetRealPath, expandNames)}`,
                rightInnerWidth,
                'left',
              )}
            </Text>
            {targetWt && (
              <Text color={targetWt.dirtyCount > 0 ? theme.warning : theme.success}>
                {fitCell(
                  `   ${targetWt.dirtyCount > 0 ? `${UI_ICONS.dirty} Dirty (${targetWt.dirtyCount} files)` : `${UI_ICONS.check} Clean working tree`}${targetWt.agentStatus.isActive ? `  ${UI_ICONS.agent} ${targetWt.agentStatus.detail || 'Agent'}` : ''}`,
                  rightInnerWidth,
                  'left',
                )}
              </Text>
            )}

            <Text color={theme.border}>{'┄'.repeat(rightInnerWidth)}</Text>

            {/* 3. Active Diagnostics on this Link */}
            <Text color={theme.secondary} bold>
              {fitCell(
                `${UI_ICONS.shield} ${locale === 'es' ? 'Diagnóstico de Colisiones del Enlace:' : 'Link Collision Diagnostics:'}`,
                rightInnerWidth,
                'left',
              )}
            </Text>
            {selectedWarnings.length === 0 ? (
              <Text color={theme.muted}>
                {fitCell(
                  `  ${UI_ICONS.check} ${locale === 'es' ? 'Sin colisiones ni contaminación cruzada en este enlace.' : 'Zero collisions or cross-contamination on this link.'}`,
                  rightInnerWidth,
                  'left',
                )}
              </Text>
            ) : (
              selectedWarnings.slice(0, 2).map((w) => {
                const wrapped = wrapCellLines(
                  `${w.severity === 'critical' ? UI_ICONS.critical : UI_ICONS.warning} [${w.type}] ${formatWarningMessage(w, locale)}`,
                  rightInnerWidth - 2,
                  2,
                )
                return (
                  <React.Fragment key={w.id}>
                    {wrapped.map((line, lIdx) => (
                      <Text
                        key={`${w.id}-l-${lIdx}`}
                        color={w.severity === 'critical' ? theme.critical : theme.warning}
                      >
                        {'  ' + line}
                      </Text>
                    ))}
                  </React.Fragment>
                )
              })
            )}
          </>
        )}
      </Box>
    </Box>
  )
}
