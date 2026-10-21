import React from 'react'
import { Box, Text } from 'ink'
import { EcosystemSnapshot } from '../core/types.js'
import { ThemePalette } from './theme.js'
import { DICTIONARIES, Locale } from '../i18n/index.js'
import { fitCell, UI_ICONS } from './utils/formatters.js'

interface Props {
  snapshot: EcosystemSnapshot | null
  activeTab: number
  isRefreshing: boolean
  isAutoRefreshPaused?: boolean
  statusMessage?: string | null
  theme: ThemePalette
  locale: Locale
  columns?: number
}

export const StatusBar: React.FC<Props> = ({
  snapshot,
  activeTab,
  isRefreshing,
  isAutoRefreshPaused = false,
  statusMessage,
  theme,
  locale,
  columns = 120,
}) => {
  const t = DICTIONARIES[locale]
  const criticalCount = snapshot?.warnings.filter((w) => w.severity === 'critical').length ?? 0
  const warningCount = snapshot?.warnings.filter((w) => w.severity === 'warning').length ?? 0
  const activeAgents = snapshot?.worktrees.filter((w) => w.agentStatus.isActive).length ?? 0
  const isCompact = columns < 105
  const isMedium = columns >= 105 && columns < 148

  const boxWidth = Math.max(60, columns - 2)
  const innerWidth = Math.max(40, boxWidth - 4)

  const wtLabel = isCompact ? 'WT' : t.tabs.wt
  const jnLabel = isCompact ? 'LNK' : isMedium ? (locale === 'es' ? 'Enlaces' : 'Links') : t.tabs.jn
  const hlLabel = isCompact ? 'HL' : isMedium ? (locale === 'es' ? 'Salud' : 'Health') : t.tabs.hl
  const tutLabel = isCompact ? 'TUT' : isMedium ? (locale === 'es' ? 'Guía' : 'Guide') : t.tabs.tut
  const cfgLabel = isCompact ? 'CFG' : isMedium ? 'Cfg' : t.tabs.cfg
  const tabGap = isMedium || isCompact ? ' ' : '  '

  const hlIcon =
    criticalCount > 0 ? UI_ICONS.critical : warningCount > 0 ? UI_ICONS.warning : UI_ICONS.shield

  const shortThemeLabel = isMedium
    ? theme.label.replace(/^Console\s+/i, '').split(' ')[0]
    : theme.label

  const rightAgentStr =
    activeAgents > 0
      ? `${UI_ICONS.agent} ${activeAgents}${
          isCompact ? '' : isMedium ? ' Ag.' : ` ${t.status.agents}`
        } `
      : ''
  const rightThemeStr = !isCompact ? `${UI_ICONS.palette} ${shortThemeLabel} ` : ''
  const rightLocaleStr = `${UI_ICONS.globe} ${locale.toUpperCase()} `
  const stateIcon = isRefreshing
    ? UI_ICONS.sync
    : isAutoRefreshPaused
      ? UI_ICONS.pause
      : UI_ICONS.bolt
  const rightStateStr = `${stateIcon} ${(isRefreshing ? t.status.scanning : isAutoRefreshPaused ? t.status.paused : t.status.live).trim()}`

  return (
    <Box flexDirection="column" marginTop={1} width={boxWidth} overflow="hidden" flexShrink={0}>
      <Box
        borderStyle="single"
        borderColor={theme.borderActive}
        paddingX={1}
        justifyContent="space-between"
        width={boxWidth}
        overflow="hidden"
        flexShrink={0}
      >
        <Box flexShrink={1} overflow="hidden">
          <Text wrap="truncate-end">
            <Text bold color={theme.primary}>
              {UI_ICONS.banyan} BANYAN{' '}
            </Text>
            <Text color={theme.muted}>│ </Text>
            <Text bold={activeTab === 1} color={activeTab === 1 ? theme.secondary : theme.text}>
              [1] {UI_ICONS.worktree} {wtLabel}({snapshot?.worktrees.length ?? 0}){tabGap}
            </Text>
            <Text bold={activeTab === 2} color={activeTab === 2 ? theme.secondary : theme.text}>
              [2] {UI_ICONS.link} {jnLabel}({snapshot?.junctions.length ?? 0}){tabGap}
            </Text>
            <Text
              bold={activeTab === 3}
              color={
                activeTab === 3 ? theme.secondary : criticalCount > 0 ? theme.critical : theme.text
              }
            >
              [3] {hlIcon} {hlLabel}({criticalCount}/{warningCount}){tabGap}
            </Text>
            <Text bold={activeTab === 4} color={activeTab === 4 ? theme.accent : theme.text}>
              [4] {UI_ICONS.book} {tutLabel}
              {tabGap}
            </Text>
            <Text bold={activeTab === 5} color={activeTab === 5 ? theme.secondary : theme.text}>
              [5] {UI_ICONS.gear} {cfgLabel}
            </Text>
          </Text>
        </Box>

        <Box flexShrink={0} marginLeft={1}>
          <Text>
            {activeAgents > 0 && (
              <Text color={theme.agent} bold>
                {rightAgentStr}
              </Text>
            )}
            {!isCompact && <Text color={theme.accent}>{rightThemeStr}</Text>}
            <Text color={theme.secondary}>{rightLocaleStr}</Text>
            <Text
              color={
                isRefreshing ? theme.warning : isAutoRefreshPaused ? theme.secondary : theme.success
              }
            >
              {fitCell(
                rightStateStr,
                Math.min(rightStateStr.length, Math.max(6, innerWidth - 20)),
                'right',
              )}
            </Text>
          </Text>
        </Box>
      </Box>

      <Box paddingX={1} justifyContent="space-between" width={boxWidth} overflow="hidden">
        <Box flexShrink={1} overflow="hidden">
          <Text color={theme.muted} wrap="truncate-end">
            {fitCell(
              t.status.help,
              statusMessage ? Math.max(20, innerWidth - statusMessage.length - 4) : innerWidth,
              'left',
            )}
          </Text>
        </Box>
        {statusMessage && (
          <Box flexShrink={0} marginLeft={1}>
            <Text color={theme.warning}>
              {fitCell(statusMessage, Math.min(44, Math.floor(innerWidth * 0.45)), 'right')}
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  )
}
