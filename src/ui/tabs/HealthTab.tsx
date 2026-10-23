import React from 'react'
import { Box, Text } from 'ink'
import { EcosystemSnapshot } from '../../core/types.js'
import { getEcosystemColor, getEcosystemIcon } from '../../core/adapters/index.js'
import { isExecutableFix } from '../../core/shellSafe.js'
import { ThemePalette } from '../theme.js'
import { DICTIONARIES, Locale } from '../../i18n/index.js'
import { localizeWarningMessage } from '../../i18n/messages.js'
import { computeVisibleWindow } from '../utils/viewportWindow.js'
import {
  fitCell,
  formatShortPath,
  formatWorktreeIdString,
  UI_ICONS,
  wrapCellLines,
} from '../utils/formatters.js'

interface Props {
  snapshot: EcosystemSnapshot
  selectedIndex?: number
  theme: ThemePalette
  locale: Locale
  terminalRows?: number
  terminalColumns?: number
  isNarrow?: boolean
}

export function formatWarningMessage(
  warn: { type: string; message: string; messageEs?: string },
  locale: Locale,
): string {
  return formatShortPath(localizeWarningMessage(warn, locale))
}

export const HealthTab: React.FC<Props> = ({
  snapshot,
  selectedIndex = 0,
  theme,
  locale,
  terminalRows = 24,
  terminalColumns = 120,
  isNarrow = false,
}) => {
  const t = DICTIONARIES[locale].hlTab
  const { warnings, worktrees } = snapshot
  const criticalCount = warnings.filter((w) => w.severity === 'critical').length
  const warningCount = warnings.length - criticalCount
  const selectedWarn = warnings[selectedIndex] || warnings[0]

  const totalWidth = Math.max(60, terminalColumns - 2)
  const gap = isNarrow ? 0 : 2
  const leftBoxWidth = isNarrow ? totalWidth : Math.floor((totalWidth - gap) * 0.46)
  const rightBoxWidth = isNarrow ? totalWidth : totalWidth - leftBoxWidth - gap

  const leftInnerWidth = Math.max(32, leftBoxWidth - 4)
  const rightInnerWidth = Math.max(32, rightBoxWidth - 4)

  const borderColor =
    criticalCount > 0 ? theme.critical : warnings.length > 0 ? theme.warning : theme.borderActive
  const titleColor =
    criticalCount > 0 ? theme.critical : warnings.length > 0 ? theme.warning : theme.primary
  const headerIcon =
    criticalCount > 0 ? UI_ICONS.critical : warnings.length > 0 ? UI_ICONS.warning : UI_ICONS.shield

  const maxRows = Math.max(4, (isNarrow ? Math.floor(terminalRows * 0.45) : terminalRows) - 13)
  const { visibleItems, startIndex } = computeVisibleWindow(warnings, selectedIndex, maxRows)

  // Left table column math:
  // [cursor: 2] + [ruleCol: ruleWidth] + ' ' + [wtCol: wtWidth] === leftInnerWidth
  const usableLeftWidth = Math.max(24, leftInnerWidth - 3)
  const ruleWidth = Math.max(16, Math.floor(usableLeftWidth * 0.54))
  const wtWidth = Math.max(10, usableLeftWidth - ruleWidth)

  const headerRight = `${warnings.length > 0 ? `[${selectedIndex + 1}/${warnings.length}] ` : ''}${criticalCount} crit · ${warningCount} warn`
  const headerLeftBudget = Math.max(10, leftInnerWidth - headerRight.length - 1)

  return (
    <Box
      flexDirection={isNarrow ? 'column' : 'row'}
      gap={gap}
      flexGrow={1}
      width={totalWidth}
      overflow="hidden"
    >
      {/* LEFT PANEL: Active Alerts & Severity Matrix */}
      <Box
        flexDirection="column"
        width={leftBoxWidth}
        borderStyle="round"
        borderColor={borderColor}
        paddingX={1}
        overflow="hidden"
      >
        <Text>
          <Text bold color={titleColor}>
            {fitCell(`${headerIcon} ${t.title.trim()}`, headerLeftBudget, 'left')}
          </Text>
          <Text color={theme.muted}>{' ' + fitCell(headerRight, headerRight.length, 'right')}</Text>
        </Text>
        <Text color={theme.border}>{'─'.repeat(leftInnerWidth)}</Text>

        {/* Column Header */}
        <Text>
          <Text color={theme.muted}>{'  '}</Text>
          <Text color={theme.muted} bold>
            {fitCell(
              locale === 'es'
                ? `${UI_ICONS.shield} REGLA / SEVERIDAD`
                : `${UI_ICONS.shield} RULE / SEVERITY`,
              ruleWidth,
              'left',
            ) + ' '}
          </Text>
          <Text color={theme.muted} bold>
            {fitCell(
              locale === 'es'
                ? `${UI_ICONS.worktree} WORKTREES AFECTADOS`
                : `${UI_ICONS.worktree} AFFECTED WORKTREES`,
              wtWidth,
              'left',
            )}
          </Text>
        </Text>
        <Text color={theme.border}>{'─'.repeat(leftInnerWidth)}</Text>

        {warnings.length === 0 ? (
          <Box flexDirection="column" marginY={1} width={leftInnerWidth} overflow="hidden">
            <Text color={theme.success} bold>
              {fitCell(
                `${UI_ICONS.shield} ${UI_ICONS.check} ${t.okTitle.trim()}`,
                leftInnerWidth,
                'left',
              )}
            </Text>
            <Text color={theme.muted}>{fitCell(`  ${t.okSub}`, leftInnerWidth, 'left')}</Text>
          </Box>
        ) : (
          visibleItems.map((warn, localIdx) => {
            const globalIdx = startIndex + localIdx
            const isSelected = globalIdx === selectedIndex
            const isCrit = warn.severity === 'critical'
            const sevColor = isCrit ? theme.critical : theme.warning
            const sevIcon = isCrit ? UI_ICONS.critical : UI_ICONS.warning
            const fixBadge = isExecutableFix(warn.suggestedFixCommand) ? `${UI_ICONS.bulb} ` : ''

            const ruleCell = `${sevIcon} ${warn.type}`
            const wtCell = `${fixBadge}${warn.affectedWorktreeIds.map(formatWorktreeIdString).join(', ')}`

            return (
              <Text key={warn.id}>
                <Text color={isSelected ? theme.accent : theme.muted} bold={isSelected}>
                  {isSelected ? '❯ ' : '  '}
                </Text>
                <Text color={isSelected ? theme.accent : sevColor} bold={isSelected || isCrit}>
                  {fitCell(ruleCell, ruleWidth, 'left') + ' '}
                </Text>
                <Text color={isSelected ? theme.text : theme.muted} bold={isSelected}>
                  {fitCell(wtCell, wtWidth, 'left')}
                </Text>
              </Text>
            )
          })
        )}
      </Box>

      {/* RIGHT PANEL: Collision Forensics, Blast Radius & Auto-Fix Console */}
      <Box
        flexDirection="column"
        width={rightBoxWidth}
        borderStyle="round"
        borderColor={
          !selectedWarn
            ? theme.success
            : selectedWarn.severity === 'critical'
              ? theme.critical
              : theme.warning
        }
        paddingX={1}
        overflow="hidden"
      >
        {!selectedWarn ? (
          <Box flexDirection="column" width={rightInnerWidth} overflow="hidden">
            <Text color={theme.success} bold>
              {fitCell(
                `${UI_ICONS.shield} ${UI_ICONS.check} ${t.okTitle.trim()}`,
                rightInnerWidth,
                'left',
              )}
            </Text>
            <Text color={theme.border}>{'─'.repeat(rightInnerWidth)}</Text>
            <Text color={theme.muted}>{fitCell(t.okSub, rightInnerWidth, 'left')}</Text>
          </Box>
        ) : (
          <>
            {/* Forensics Header */}
            {(() => {
              const isCrit = selectedWarn.severity === 'critical'
              const sevColor = isCrit ? theme.critical : theme.warning
              const sevIcon = isCrit ? UI_ICONS.critical : UI_ICONS.warning
              const sevLabel = isCrit ? t.crit.trim() : t.warn.trim()
              const badge = `${sevIcon} ${sevLabel}`
              const leftBudget = Math.max(10, rightInnerWidth - badge.length - 1)
              return (
                <Text>
                  <Text bold color={theme.primary}>
                    {fitCell(
                      `${UI_ICONS.bolt} ${locale === 'es' ? 'Forense de Colisión' : 'Collision Forensics'}: [${selectedWarn.type}]`,
                      leftBudget,
                      'left',
                    )}
                  </Text>
                  <Text bold color={sevColor}>
                    {' ' + fitCell(badge, badge.length, 'right')}
                  </Text>
                </Text>
              )
            })()}
            <Text color={theme.border}>{'─'.repeat(rightInnerWidth)}</Text>

            {/* 1. Root Cause Explanation (Wrapped cleanly across 3 lines) */}
            <Text color={theme.secondary} bold>
              {fitCell(
                `${UI_ICONS.info} ${locale === 'es' ? '1. Diagnóstico y Causa Raíz:' : '1. Diagnostic & Root Cause:'}`,
                rightInnerWidth,
                'left',
              )}
            </Text>
            {wrapCellLines(formatWarningMessage(selectedWarn, locale), rightInnerWidth - 2, 3).map(
              (line, idx) => (
                <Text key={`msg-line-${idx}`} color={theme.text}>
                  {'  ' + line}
                </Text>
              ),
            )}

            <Text color={theme.border}>{'┄'.repeat(rightInnerWidth)}</Text>

            {/* 2. Blast Radius: Affected Worktrees */}
            <Text color={theme.secondary} bold>
              {fitCell(
                `${UI_ICONS.worktree} ${locale === 'es' ? `2. Radio de Impacto (${selectedWarn.affectedWorktreeIds.length} worktrees):` : `2. Blast Radius (${selectedWarn.affectedWorktreeIds.length} worktrees):`}`,
                rightInnerWidth,
                'left',
              )}
            </Text>
            {selectedWarn.affectedWorktreeIds.slice(0, 3).map((wtId) => {
              const wt = worktrees.find((w) => w.id === wtId)
              if (!wt) {
                return (
                  <Text key={`blast-${wtId}`} color={theme.text}>
                    {fitCell(`  ◈ [${formatWorktreeIdString(wtId)}]`, rightInnerWidth, 'left')}
                  </Text>
                )
              }
              const ecoIcon = getEcosystemIcon(wt.detectedEcosystems?.[0])
              const ecoColor = getEcosystemColor(wt.detectedEcosystems?.[0])
              const stateStr =
                wt.dirtyCount > 0
                  ? `${UI_ICONS.dirty} dirty (${wt.dirtyCount})`
                  : `${UI_ICONS.check} clean`
              const agentStr = wt.agentStatus.isActive
                ? `  ${UI_ICONS.agent} ${wt.agentStatus.detail || 'agent'}`
                : ''
              const leftPart = `  ${ecoIcon} [${formatWorktreeIdString(wt.id)}] ${UI_ICONS.branch} ${wt.branch}`
              const rightPart = `${stateStr}${agentStr}`
              const leftBudget = Math.max(12, rightInnerWidth - rightPart.length - 1)
              return (
                <Text key={`blast-${wtId}`}>
                  <Text color={ecoColor} bold>
                    {fitCell(leftPart, leftBudget, 'left')}
                  </Text>
                  <Text
                    color={
                      wt.dirtyCount > 0 || wt.agentStatus.isActive ? theme.warning : theme.success
                    }
                  >
                    {' ' + fitCell(rightPart, rightPart.length, 'right')}
                  </Text>
                </Text>
              )
            })}

            <Text color={theme.border}>{'┄'.repeat(rightInnerWidth)}</Text>

            {/* 3. Auto-Fix Console */}
            <Text color={theme.secondary} bold>
              {fitCell(
                isExecutableFix(selectedWarn.suggestedFixCommand)
                  ? `${UI_ICONS.bulb} ${t.fix.trim()}`
                  : `${UI_ICONS.info} ${locale === 'es' ? 'Pista / Snippet Sugerido:' : 'Suggested Hint / Snippet:'}`,
                rightInnerWidth,
                'left',
              )}
            </Text>
            {selectedWarn.suggestedFixCommand ? (
              isExecutableFix(selectedWarn.suggestedFixCommand) ? (
                <>
                  {wrapCellLines(
                    `$ ${formatShortPath(selectedWarn.suggestedFixCommand)}`,
                    rightInnerWidth - 2,
                    2,
                  ).map((cmdLine, cIdx) => (
                    <Text key={`cmd-${cIdx}`} color={theme.accent} bold>
                      {'  ' + cmdLine}
                    </Text>
                  ))}
                  <Text color={theme.muted}>
                    {fitCell(
                      `  ${UI_ICONS.bulb} [f] Auto-Fix   ${UI_ICONS.copy} [y] Copy   ${UI_ICONS.book} [e] ${locale === 'es' ? 'Explicar Regla' : 'Explain Rule'}`,
                      rightInnerWidth,
                      'left',
                    )}
                  </Text>
                </>
              ) : (
                <>
                  {wrapCellLines(
                    formatShortPath(selectedWarn.suggestedFixCommand),
                    rightInnerWidth - 2,
                    2,
                  ).map((cmdLine, cIdx) => (
                    <Text key={`cmd-${cIdx}`} color={theme.warning} bold>
                      {'  ' + cmdLine}
                    </Text>
                  ))}
                  <Text color={theme.muted}>
                    {fitCell(
                      `  ${UI_ICONS.copy} [y] Copy   ${UI_ICONS.gear} [c] Config   ${UI_ICONS.book} [e] ${locale === 'es' ? 'Explicar Regla' : 'Explain Rule'}`,
                      rightInnerWidth,
                      'left',
                    )}
                  </Text>
                </>
              )
            ) : (
              <Text color={theme.muted}>
                {fitCell(
                  `  ${UI_ICONS.book} [e] ${locale === 'es' ? 'Pulsa [e] para abrir la guía interactiva de esta alerta' : 'Press [e] to open interactive guide for this alert'}`,
                  rightInnerWidth,
                  'left',
                )}
              </Text>
            )}
          </>
        )}
      </Box>
    </Box>
  )
}
