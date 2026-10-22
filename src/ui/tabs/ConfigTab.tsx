import React from 'react'
import { Box, Text } from 'ink'
import { BanyanConfig, EcosystemSnapshot, WorkspaceConfig } from '../../core/types.js'
import { ThemePalette } from '../theme.js'
import { DICTIONARIES, Locale } from '../../i18n/index.js'
import { readConfigFileRaw } from '../../core/configEditor.js'
import { JsonLineView } from '../components/JsonHighlight.js'

interface Props {
  configPath?: string | null
  workspaceName: string
  workspaceConfig: WorkspaceConfig
  rawConfig?: BanyanConfig | null
  detectedEditor: string
  scrollOffset?: number
  theme: ThemePalette
  locale: Locale
  isMuxActive?: boolean
  isNarrow?: boolean
  snapshot?: EcosystemSnapshot | null
}

export const ConfigTab: React.FC<Props> = ({
  configPath,
  workspaceName,
  workspaceConfig,
  rawConfig,
  detectedEditor,
  scrollOffset = 0,
  theme,
  locale,
  isMuxActive = false,
  isNarrow = false,
  snapshot,
}) => {
  const t = DICTIONARIES[locale].cfgTab

  // Retrieve raw JSON string
  const rawJsonContent = configPath
    ? readConfigFileRaw(configPath) || JSON.stringify(rawConfig, null, 2)
    : JSON.stringify(workspaceConfig, null, 2)

  const jsonLines = (rawJsonContent || '').split('\n')
  const MAX_VISIBLE_LINES = 12
  const visibleLines = jsonLines.slice(scrollOffset, scrollOffset + MAX_VISIBLE_LINES)

  const availableWorkspaces = rawConfig?.workspaces
    ? Object.keys(rawConfig.workspaces)
    : [workspaceName]

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.borderActive}
      paddingX={1}
      flexGrow={1}
      width="100%"
      overflow="hidden"
    >
      {/* 1. Header */}
      <Box justifyContent="space-between" marginBottom={1} width="100%" overflow="hidden">
        <Box flexShrink={1} overflow="hidden">
          <Text bold color={theme.primary} wrap="truncate-end">
            {t.title}
          </Text>
        </Box>
        <Box flexShrink={0} marginLeft={1}>
          <Text wrap="truncate-end">
            <Text color={theme.muted}>{t.detectedEditor} </Text>
            <Text bold color={theme.accent}>
              [{detectedEditor}]
            </Text>
            {isMuxActive && <Text color={theme.success}> • [{t.muxActive}]</Text>}
          </Text>
        </Box>
      </Box>

      {/* 2. Overview: Path, Active Workspace, Defined Workspaces */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={theme.border}
        paddingX={1}
        marginBottom={1}
        width="100%"
        overflow="hidden"
      >
        <Box width="100%" overflow="hidden">
          <Text wrap="truncate-end">
            <Text color={theme.muted}>{t.activeFile} </Text>
            {configPath ? (
              <Text color={theme.success} bold>
                {configPath}
              </Text>
            ) : (
              <Text color={theme.warning}>{t.notFound}</Text>
            )}
          </Text>
        </Box>

        <Box marginTop={1} width="100%" overflow="hidden">
          <Text wrap="truncate-end">
            <Text color={theme.muted}>{t.workspaceTitle} </Text>
            <Text bold color={theme.secondary}>
              {workspaceName}{' '}
            </Text>
            <Text color={theme.muted}>Root: </Text>
            <Text color={theme.text}>{workspaceConfig.root} </Text>
            <Text color={theme.muted}>Subdirs: </Text>
            <Text color={workspaceConfig.discoverSubdirs ? theme.success : theme.muted}>
              {workspaceConfig.discoverSubdirs ? 'auto-discover' : 'explicit-only'}
            </Text>
          </Text>
        </Box>

        {availableWorkspaces.length > 1 && (
          <Box marginTop={1} width="100%" overflow="hidden">
            <Text wrap="truncate-end">
              <Text color={theme.muted}>{t.workspacesAvailable} </Text>
              {availableWorkspaces.map((ws) => (
                <Text
                  key={ws}
                  bold={ws === workspaceName}
                  color={ws === workspaceName ? theme.accent : theme.text}
                >
                  [{ws}
                  {ws === workspaceName ? ' *' : ''}]{' '}
                </Text>
              ))}
            </Text>
          </Box>
        )}
      </Box>

      {/* 3. Repositories & Adapters Summary */}
      <Box
        flexDirection={isNarrow ? 'column' : 'row'}
        gap={isNarrow ? 1 : 2}
        marginBottom={1}
        width="100%"
        overflow="hidden"
      >
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor={theme.border}
          paddingX={1}
          width={isNarrow ? '100%' : '50%'}
          overflow="hidden"
        >
          <Text bold color={theme.secondary} wrap="truncate-end">
            {t.reposConfigured} ({workspaceConfig.repos.length})
          </Text>
          {workspaceConfig.repos.length === 0 ? (
            <Text color={theme.muted} wrap="truncate-end">
              {' '}
              Auto-discovered from subdirectories
            </Text>
          ) : (
            workspaceConfig.repos.slice(0, 4).map((r) => {
              const isMissing = snapshot?.missingRepos?.some(
                (m) => m.alias === r.alias || m.path === r.path,
              )
              return (
                <Box key={r.alias} width="100%" overflow="hidden">
                  <Text wrap="truncate-end">
                    <Text color={isMissing ? theme.warning : theme.accent} bold>
                      • {r.alias}:{' '}
                    </Text>
                    <Text color={theme.text}>{r.path}</Text>
                    {isMissing && (
                      <Text color={theme.critical} bold>
                        {' '}
                        [{locale === 'es' ? 'NO ENCONTRADO' : 'NOT FOUND'}]
                      </Text>
                    )}
                  </Text>
                </Box>
              )
            })
          )}
          {workspaceConfig.repos.length > 4 && (
            <Text color={theme.muted} wrap="truncate-end">
              {' '}
              ...{' '}
              {locale === 'es'
                ? `y ${workspaceConfig.repos.length - 4} más`
                : `and ${workspaceConfig.repos.length - 4} more`}
            </Text>
          )}
        </Box>

        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor={theme.border}
          paddingX={1}
          width={isNarrow ? '100%' : '50%'}
          overflow="hidden"
        >
          <Text bold color={theme.secondary} wrap="truncate-end">
            {t.adaptersTitle}
          </Text>
          <Text wrap="truncate-end">
            <Text color={theme.muted}>Node Adapter: </Text>
            <Text color={theme.text}>
              {String(workspaceConfig.adapters?.node?.enabled ?? 'auto')}
            </Text>
          </Text>
          <Text wrap="truncate-end">
            <Text color={theme.muted}>Highlight Scopes: </Text>
            <Text color={theme.text}>
              {workspaceConfig.adapters?.node?.highlightScopes?.join(', ') || 'none'}
            </Text>
          </Text>
          <Box marginTop={1} width="100%" overflow="hidden">
            <Text wrap="truncate-end">
              <Text bold color={theme.secondary}>
                {t.agentTitle}{' '}
              </Text>
              <Text color={theme.agent}>
                {workspaceConfig.agentDetection?.lockFiles?.join(' ') || '.aider* .claude*'} (
                {workspaceConfig.agentDetection?.recentModifiedThresholdSec ?? 45}s)
              </Text>
            </Text>
          </Box>
        </Box>
      </Box>

      {/* 4. JSON Syntax Preview */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={theme.border}
        paddingX={1}
        flexGrow={1}
        width="100%"
        overflow="hidden"
      >
        <Box justifyContent="space-between" marginBottom={1} width="100%" overflow="hidden">
          <Box flexShrink={1} overflow="hidden">
            <Text bold color={theme.text} wrap="truncate-end">
              {t.jsonPreview}
            </Text>
          </Box>
          <Box flexShrink={0} marginLeft={1}>
            <Text color={theme.muted} wrap="truncate-end">
              [L{scrollOffset + 1}-{Math.min(scrollOffset + MAX_VISIBLE_LINES, jsonLines.length)}/
              {jsonLines.length}] [j/k]
            </Text>
          </Box>
        </Box>
        {visibleLines.map((line, idx) => {
          const lineNum = scrollOffset + idx + 1
          return <JsonLineView key={lineNum} line={line} lineNum={lineNum} theme={theme} />
        })}
      </Box>

      {/* 5. Action footer */}
      <Box marginTop={1} paddingX={1} justifyContent="space-between" width="100%" overflow="hidden">
        <Box flexShrink={1} overflow="hidden">
          <Text color={theme.accent} bold wrap="truncate-end">
            {t.actions}
          </Text>
        </Box>
        {!configPath && (
          <Box flexShrink={0} marginLeft={1}>
            <Text color={theme.warning} wrap="truncate-end">
              {t.createHint}
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  )
}
