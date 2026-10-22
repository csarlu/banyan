import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Box, Text, useApp, useInput, useStdout } from 'ink'
import {
  EcosystemSnapshot,
  WorkspaceConfig,
  WorktreeNode,
  CollisionWarning,
} from '../core/types.js'
import { buildEcosystemSnapshot, areSnapshotsEquivalent } from '../core/orchestrator.js'
import { removeWorktree } from '../core/git.js'
import { copyToClipboard } from '../core/clipboard.js'
import { executeFixCommand } from '../core/fixRunner.js'
import { createWorktreeWithStrategy } from '../core/worktreeCreator.js'
import { getMuxBinaryName, openMuxSplit, openMuxWindow } from '../integrations/mux.js'
import { muxInstallHint } from '../core/prerequisites.js'
import { BANYAN_VERSION } from '../version.js'
import { BanyanSplash } from './Splash.js'
import { StatusBar } from './StatusBar.js'
import { WorktreeTab } from './tabs/WorktreeTab.js'
import { JunctionTab } from './tabs/JunctionTab.js'
import { HealthTab } from './tabs/HealthTab.js'
import { TutorialTab } from './tabs/TutorialTab.js'
import { ConfirmModal } from './components/ConfirmModal.js'
import { CreateWorktreeModal } from './components/CreateWorktreeModal.js'
import { ExplainModal } from './components/ExplainModal.js'
import { LegendModal } from './components/LegendModal.js'
import { ConfigTab } from './tabs/ConfigTab.js'
import { DocTopicId, DOC_TOPICS } from '../docs/knowledgeBase.js'
import { getNextTheme, THEMES, ThemeName } from './theme.js'
import { detectDefaultLocale, DICTIONARIES, Locale } from '../i18n/index.js'
import { openConfigInEditor, detectEditor, OpenEditorTarget } from '../core/configEditor.js'
import { loadConfig } from '../core/config.js'
import { BanyanConfig } from '../core/types.js'
import { useTerminalDimensions } from './hooks/useTerminalDimensions.js'
import { filterWorktrees, filterJunctions, WorktreeFilterMode } from './utils/searchFilter.js'

interface Props {
  baseCwd?: string
  configPath?: string
  rawConfig?: BanyanConfig
  workspaceName: string
  workspaceConfig: WorkspaceConfig
  showSplashInitially?: boolean
  startInTutorial?: boolean
  initialTab?: number
  initialExplainTopic?: DocTopicId | null
  initialShowLegend?: boolean
  initialTheme?: ThemeName
  initialLocale?: Locale
  isThemeExplicit?: boolean
  isLocaleExplicit?: boolean
  onSelectWorktreeForCd?: (targetPath: string) => void
}

export const App: React.FC<Props> = ({
  baseCwd,
  configPath: initialConfigPath,
  rawConfig: initialRawConfig,
  workspaceName,
  workspaceConfig,
  showSplashInitially = true,
  startInTutorial = false,
  initialTab,
  initialExplainTopic = null,
  initialShowLegend = false,
  initialTheme = 'default',
  initialLocale,
  isThemeExplicit = false,
  isLocaleExplicit = false,
  onSelectWorktreeForCd,
}) => {
  const { exit } = useApp()
  const { columns, rows, isNarrow } = useTerminalDimensions()
  const [themeName, setThemeName] = useState<ThemeName>(initialTheme)
  const [locale, setLocale] = useState<Locale>(initialLocale || detectDefaultLocale())
  const theme = THEMES[themeName] || THEMES.default
  const t = DICTIONARIES[locale]

  const [currentWorkspaceName, setCurrentWorkspaceName] = useState<string>(workspaceName)
  const [currentConfig, setCurrentConfig] = useState<WorkspaceConfig>(workspaceConfig)
  const [configPath, setConfigPath] = useState<string | undefined>(initialConfigPath)
  const [rawConfig, setRawConfig] = useState<BanyanConfig | undefined>(initialRawConfig)
  const [configScrollOffset, setConfigScrollOffset] = useState<number>(0)
  const detectedEditor = useMemo(() => detectEditor(), [])

  const [showSplash, setShowSplash] = useState(showSplashInitially)
  const [manualSplash, setManualSplash] = useState(false)
  const bootStartRef = useRef<number>(Date.now())
  const [activeTab, setActiveTab] = useState<number>(initialTab ?? (startInTutorial ? 4 : 1))
  const [selectedWorktreeId, setSelectedWorktreeId] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<EcosystemSnapshot | null>(null)
  const [isRefreshing, setIsRefreshing] = useState<boolean>(true)
  const [isAutoRefreshPaused, setIsAutoRefreshPaused] = useState<boolean>(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [pendingDeleteWt, setPendingDeleteWt] = useState<WorktreeNode | null>(null)
  const [pendingCreateSourceWt, setPendingCreateSourceWt] = useState<WorktreeNode | null>(null)
  const [pendingFixWarning, setPendingFixWarning] = useState<{
    warning: CollisionWarning
    cwd: string
  } | null>(null)
  const [explainTopic, setExplainTopic] = useState<DocTopicId | null>(initialExplainTopic)
  const [activePanel, setActivePanel] = useState<'left' | 'right'>('left')
  const [selectedJunctionIndex, setSelectedJunctionIndex] = useState<number>(0)
  const [selectedWarningIndex, setSelectedWarningIndex] = useState<number>(0)
  const [isSearchActive, setIsSearchActive] = useState<boolean>(false)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [wtFilterMode, setWtFilterMode] = useState<WorktreeFilterMode>('all')
  const [expandNames, setExpandNames] = useState<boolean>(false)
  const [showLegend, setShowLegend] = useState<boolean>(initialShowLegend)

  const handleCycleTopic = (dir: 1 | -1) => {
    setExplainTopic((current) => {
      const idx = DOC_TOPICS.indexOf(current || 'concepts')
      const nextIdx = (idx + dir + DOC_TOPICS.length) % DOC_TOPICS.length
      return DOC_TOPICS[nextIdx]
    })
  }

  const snapshotRef = useRef<EcosystemSnapshot | null>(null)
  const isScanningRef = useRef<boolean>(false)

  const refresh = useCallback(
    async (isManual: boolean = false) => {
      if (!isManual && isScanningRef.current) {
        return
      }
      isScanningRef.current = true
      if (isManual) {
        setIsRefreshing(true)
      }
      try {
        const snap = await buildEcosystemSnapshot(currentWorkspaceName, currentConfig, {
          skipIfUnchanged: !isManual,
        })
        const isChanged = !areSnapshotsEquivalent(snapshotRef.current, snap)
        if (isChanged) {
          snapshotRef.current = snap
          setSnapshot(snap)
          setSelectedWorktreeId((prevId) => {
            if (snap.worktrees.length === 0) return null
            if (prevId && snap.worktrees.some((w) => w.id === prevId)) return prevId
            return snap.worktrees[0].id
          })
        }
      } catch (err: any) {
        setStatusMessage(`Error: ${err?.message || 'Scan failed'}`)
      } finally {
        isScanningRef.current = false
        if (isManual) {
          setIsRefreshing(false)
        }
      }
    },
    [currentWorkspaceName, currentConfig],
  )
  const { write } = useStdout()
  const muxName = useMemo(() => getMuxBinaryName(), [])
  const muxUnavailableMsg =
    locale === 'es'
      ? `⚠ ${muxName} no disponible. Instálalo con: ${muxInstallHint(process.platform)}`
      : `⚠ ${muxName} unavailable. Install it with: ${muxInstallHint(process.platform)}`
  const isMuxActive = useMemo(() => Boolean(process.env.TMUX || process.env.TMUX_PANE), [])

  const handleOpenConfigEditor = useCallback(
    async (targetMode: OpenEditorTarget = 'inline') => {
      const result = await openConfigInEditor(baseCwd || process.cwd(), undefined, targetMode)
      if (!result.ok) {
        setStatusMessage(`Editor error: ${result.error}`)
        return
      }

      if (result.mode === 'split') {
        setStatusMessage(
          locale === 'es'
            ? `✔ Editor abierto en Split (${muxName}): ${result.editor}`
            : `✔ Editor opened in Split (${muxName}): ${result.editor}`,
        )
        return
      }

      if (result.mode === 'tab' || result.mode === 'external') {
        setStatusMessage(
          locale === 'es'
            ? `✔ Editor abierto en nueva pestaña/ventana: ${result.editor}`
            : `✔ Editor opened in new tab/window: ${result.editor}`,
        )
        return
      }

      // Inline mode: Force Ink to clear its line cache and do a full repaint!
      if (typeof write === 'function') {
        write('')
      }

      try {
        const loaded = await loadConfig(baseCwd || process.cwd(), currentWorkspaceName)
        setCurrentConfig(loaded.workspace)
        setCurrentWorkspaceName(loaded.workspaceName)
        setConfigPath(loaded.configPath)
        setRawConfig(loaded.rawConfig)
        setStatusMessage(
          locale === 'es'
            ? `✔ Config guardada y recargada (${loaded.configPath ? 'banyan.config.json' : 'auto'}) con ${result.editor}`
            : `✔ Config saved & reloaded (${loaded.configPath ? 'banyan.config.json' : 'auto'}) with ${result.editor}`,
        )
        await refresh(true)
      } catch (err: any) {
        setStatusMessage(`Config syntax/validation error: ${err?.message || 'Invalid format'}`)
      }
    },
    [baseCwd, currentWorkspaceName, locale, refresh, muxName, write],
  )

  const handleCycleWorkspace = useCallback(async () => {
    if (!rawConfig?.workspaces) return
    const wsNames = Object.keys(rawConfig.workspaces)
    if (wsNames.length <= 1) return
    const currentIdx = wsNames.indexOf(currentWorkspaceName)
    const nextIdx = (currentIdx + 1) % wsNames.length
    const nextWsName = wsNames[nextIdx]
    try {
      bootStartRef.current = Date.now()
      setSnapshot(null)
      setShowSplash(true)
      const loaded = await loadConfig(baseCwd || process.cwd(), nextWsName)
      setCurrentWorkspaceName(loaded.workspaceName)
      setCurrentConfig(loaded.workspace)
      if (!isThemeExplicit && (loaded.workspace.theme || loaded.rawConfig?.theme)) {
        setThemeName((loaded.workspace.theme || loaded.rawConfig?.theme) as ThemeName)
      }
      if (!isLocaleExplicit && (loaded.workspace.lang || loaded.rawConfig?.lang)) {
        setLocale((loaded.workspace.lang || loaded.rawConfig?.lang) as Locale)
      }
      setStatusMessage(
        locale === 'es' ? `Workspace: "${nextWsName}"` : `Workspace: "${nextWsName}"`,
      )
      await refresh(true)
    } catch (err: any) {
      setShowSplash(false)
      setStatusMessage(`Error loading workspace: ${err?.message}`)
    }
  }, [rawConfig, currentWorkspaceName, baseCwd, locale, refresh, isThemeExplicit, isLocaleExplicit])

  const filteredWorktrees = useMemo(() => {
    if (!snapshot) return []
    return filterWorktrees(snapshot.worktrees, wtFilterMode, searchQuery, snapshot.warnings)
  }, [snapshot, wtFilterMode, searchQuery])

  const filteredJunctions = useMemo(() => {
    if (!snapshot) return []
    return filterJunctions(snapshot.junctions, searchQuery)
  }, [snapshot, searchQuery])

  const selectedIndex = useMemo(() => {
    if (!snapshot || filteredWorktrees.length === 0 || !selectedWorktreeId) return 0
    const idx = filteredWorktrees.findIndex((w) => w.id === selectedWorktreeId)
    return idx >= 0 ? idx : 0
  }, [snapshot, filteredWorktrees, selectedWorktreeId])

  useEffect(() => {
    refresh(true)
  }, [refresh])

  useEffect(() => {
    if (isAutoRefreshPaused) return
    const timer = setInterval(() => {
      refresh(false)
    }, 4000)
    return () => clearInterval(timer)
  }, [refresh, isAutoRefreshPaused])

  useEffect(() => {
    if (showSplash && !manualSplash && snapshot) {
      const elapsed = Date.now() - bootStartRef.current
      const remaining = Math.max(0, 650 - elapsed)
      const timer = setTimeout(() => setShowSplash(false), remaining)
      return () => clearTimeout(timer)
    }
  }, [showSplash, manualSplash, snapshot])

  useInput(async (input, key) => {
    if (pendingDeleteWt || explainTopic || pendingFixWarning || pendingCreateSourceWt || showLegend)
      return
    if (showSplash) {
      setShowSplash(false)
      setManualSplash(false)
      return
    }

    const worktrees = filteredWorktrees
    const junctions = filteredJunctions
    const warnings = snapshot?.warnings ?? []
    const muxName = getMuxBinaryName()

    // Search bar input capture
    if (isSearchActive) {
      if (key.escape) {
        setIsSearchActive(false)
        setSearchQuery('')
        return
      }
      if (key.return) {
        setIsSearchActive(false)
        if (activeTab === 1 && worktrees.length > 0) {
          const chosen = worktrees[selectedIndex]
          if (chosen && !chosen.isBare) {
            onSelectWorktreeForCd?.(chosen.worktreePath)
            exit()
          }
        }
        return
      }
      if (key.backspace || key.delete) {
        setSearchQuery((prev) => prev.slice(0, -1))
        return
      }
      if (input && !key.ctrl && !key.meta && input.length === 1) {
        setSearchQuery((prev) => prev + input)
        return
      }
      return
    }

    if (input === 'q' || key.escape) {
      if (searchQuery.length > 0) {
        setSearchQuery('')
        return
      }
      exit()
      return
    }

    if (input === '/' && (activeTab === 1 || activeTab === 2)) {
      setIsSearchActive(true)
      return
    }

    if (input === 'i') {
      setShowLegend(true)
      return
    }

    if (input === 'K') {
      setExpandNames((prev) => {
        const next = !prev
        setStatusMessage(
          next
            ? locale === 'es'
              ? 'Vista de nombres completos activada [K]'
              : 'Full names & paths expanded [K]'
            : locale === 'es'
              ? 'Vista compacta activada [K]'
              : 'Compact trimmed names enabled [K]',
        )
        return next
      })
      return
    }

    if (input === 'F' && activeTab === 1) {
      const modes: WorktreeFilterMode[] = ['all', 'agents', 'collisions', 'dirty']
      const nextIdx = (modes.indexOf(wtFilterMode) + 1) % modes.length
      const nextMode = modes[nextIdx]
      setWtFilterMode(nextMode)
      setStatusMessage(
        locale === 'es'
          ? `Filtro: ${nextMode === 'all' ? 'Todos' : nextMode === 'agents' ? 'Agentes Activos' : nextMode === 'collisions' ? 'Con Colisiones' : 'Solo Dirty'}`
          : `Filter: ${nextMode === 'all' ? 'All' : nextMode === 'agents' ? 'Active Agents' : nextMode === 'collisions' ? 'With Collisions' : 'Dirty Only'}`,
      )
      return
    }

    // 1. Direct tab switching & cycling
    if (input === '1') {
      setActiveTab(1)
      setActivePanel('left')
    } else if (input === '2') setActiveTab(2)
    else if (input === '3') setActiveTab(3)
    else if (input === '4' || input === '?') setActiveTab(4)
    else if (input === '5') setActiveTab(5)
    else if (key.tab || input === ']') setActiveTab((prev) => (prev % 5) + 1)
    else if (input === '[') setActiveTab((prev) => (prev === 1 ? 5 : prev - 1))

    // 2. Global controls
    else if (input === 't') setThemeName((prev) => getNextTheme(prev))
    else if (input === 'L') setLocale((prev) => (prev === 'es' ? 'en' : 'es'))
    else if (input === 'c' || input === 'C') {
      await handleOpenConfigEditor()
    } else if (input === 'p') {
      const nextPaused = !isAutoRefreshPaused
      setIsAutoRefreshPaused(nextPaused)
      setStatusMessage(
        nextPaused
          ? locale === 'es'
            ? 'Auto-refresh pausado [p]'
            : 'Auto-refresh paused [p]'
          : locale === 'es'
            ? 'Auto-refresh reanudado [p]'
            : 'Auto-refresh resumed [p]',
      )
      if (!nextPaused) {
        refresh(false)
      }
    } else if (input === 'r') {
      try {
        const loaded = await loadConfig(baseCwd || process.cwd(), currentWorkspaceName)
        setCurrentConfig(loaded.workspace)
        setCurrentWorkspaceName(loaded.workspaceName)
        setConfigPath(loaded.configPath)
        setRawConfig(loaded.rawConfig)
      } catch (err: any) {
        setStatusMessage(`Config reload error: ${err?.message}`)
      }
      await refresh(true)
      setStatusMessage(
        locale === 'es' ? 'Refresco y config completados' : 'Refresh & config complete',
      )
    } else if (input === 'b') {
      setManualSplash(true)
      setShowSplash(true)
    }

    // 3. Contextual Explain [e] (explains current selection)
    else if (input === 'e') {
      if (activeTab === 3 && warnings.length > 0) {
        const chosenWarn = warnings[selectedWarningIndex] || warnings[0]
        setExplainTopic(chosenWarn.type as DocTopicId)
      } else {
        const firstWarning = warnings[0]
        setExplainTopic(firstWarning ? (firstWarning.type as DocTopicId) : 'concepts')
      }
    }

    // 3b. Interactive Auto-Fix [f] & Clipboard Yank [y]
    else if (input === 'y') {
      if (activeTab === 3 && warnings.length > 0) {
        const chosen = warnings[selectedWarningIndex] || warnings[0]
        if (chosen?.suggestedFixCommand) {
          const ok = await copyToClipboard(chosen.suggestedFixCommand)
          setStatusMessage(
            ok
              ? locale === 'es'
                ? '✔ Comando copiado al portapapeles'
                : '✔ Copied fix command to clipboard'
              : 'Failed to copy',
          )
        } else {
          setStatusMessage(
            locale === 'es'
              ? 'No hay comando de arreglo para esta alerta'
              : 'No fix command for this alert',
          )
        }
      } else if (activeTab === 1 && worktrees.length > 0) {
        const chosen = worktrees[selectedIndex]
        if (chosen) {
          const ok = await copyToClipboard(chosen.worktreePath)
          setStatusMessage(
            ok
              ? locale === 'es'
                ? `✔ Ruta copiada: ${chosen.worktreePath}`
                : `✔ Copied path: ${chosen.worktreePath}`
              : 'Failed to copy',
          )
        }
      }
    } else if (input === 'f') {
      if (activeTab === 3 && warnings.length > 0) {
        const chosen = warnings[selectedWarningIndex] || warnings[0]
        if (chosen?.suggestedFixCommand) {
          const affectedWt = worktrees.find((w) => chosen.affectedWorktreeIds.includes(w.id))
          const cwd = affectedWt?.worktreePath || baseCwd || process.cwd()
          setPendingFixWarning({ warning: chosen, cwd })
        }
      } else if (activeTab === 1 && worktrees.length > 0) {
        const chosen = worktrees[selectedIndex]
        if (chosen) {
          const fixable = warnings.find(
            (w) => w.affectedWorktreeIds.includes(chosen.id) && w.suggestedFixCommand,
          )
          if (fixable) {
            setPendingFixWarning({ warning: fixable, cwd: chosen.worktreePath })
          } else {
            setStatusMessage(
              locale === 'es'
                ? 'No hay auto-fix disponible para este worktree'
                : 'No auto-fix available for this worktree',
            )
          }
        }
      }
    }

    // 4. Horizontal Vim Navigation [h] / [l] / Left / Right
    else if (key.leftArrow || input === 'h') {
      if (activeTab === 1) {
        if (activePanel === 'right') {
          setActivePanel('left')
        } else {
          setActiveTab(5)
        }
      } else if (activeTab === 2) {
        setActiveTab(1)
        setActivePanel('right')
      } else if (activeTab === 3) {
        setActiveTab(2)
      } else if (activeTab === 4) {
        setActiveTab(3)
      } else if (activeTab === 5) {
        setActiveTab(4)
      }
    } else if (key.rightArrow || input === 'l') {
      if (activeTab === 1) {
        if (activePanel === 'left') {
          setActivePanel('right')
        } else {
          setActiveTab(2)
        }
      } else if (activeTab === 2) {
        setActiveTab(3)
      } else if (activeTab === 3) {
        setActiveTab(4)
      } else if (activeTab === 4) {
        setActiveTab(5)
      } else if (activeTab === 5) {
        setActiveTab(1)
        setActivePanel('left')
      }
    }

    // 5. Vertical Vim Navigation [j] / [k] / [g] / [G] & Actions
    if (activeTab === 1 && worktrees.length > 0) {
      if (key.upArrow || input === 'k') {
        const nextIdx = (selectedIndex - 1 + worktrees.length) % worktrees.length
        setSelectedWorktreeId(worktrees[nextIdx].id)
      } else if (key.downArrow || input === 'j') {
        const nextIdx = (selectedIndex + 1) % worktrees.length
        setSelectedWorktreeId(worktrees[nextIdx].id)
      } else if (input === 'g') {
        setSelectedWorktreeId(worktrees[0].id)
      } else if (input === 'G') {
        setSelectedWorktreeId(worktrees[worktrees.length - 1].id)
      } else if (key.return) {
        const chosen = worktrees[selectedIndex]
        if (chosen && !chosen.isBare) {
          onSelectWorktreeForCd?.(chosen.worktreePath)
          exit()
        }
      } else if (input === 's') {
        const chosen = worktrees[selectedIndex]
        if (chosen) {
          const ok = await openMuxSplit(chosen.worktreePath, 'h')
          setStatusMessage(ok ? `Split ${muxName}: ${chosen.id}` : muxUnavailableMsg)
        }
      } else if (input === 'w') {
        const chosen = worktrees[selectedIndex]
        if (chosen) {
          const ok = await openMuxWindow(chosen.worktreePath, chosen.id)
          setStatusMessage(ok ? `Window ${muxName}: ${chosen.id}` : muxUnavailableMsg)
        }
      } else if (input === 'x') {
        const chosen = worktrees[selectedIndex]
        if (chosen && !chosen.isBare) setPendingDeleteWt(chosen)
      } else if (input === 'n') {
        const chosen = worktrees[selectedIndex]
        if (chosen) setPendingCreateSourceWt(chosen)
      } else if (input === 'a') {
        const chosen = worktrees[selectedIndex]
        if (chosen) {
          const agentCmd = currentConfig.agentDetection?.agentCommand || 'claude'
          const ok = await openMuxSplit(chosen.worktreePath, 'h', [agentCmd])
          setStatusMessage(
            ok
              ? locale === 'es'
                ? `✔ Agente [${agentCmd}] lanzado en ${chosen.id}`
                : `✔ Agent [${agentCmd}] launched in ${chosen.id}`
              : muxUnavailableMsg,
          )
        }
      }
    } else if (activeTab === 2 && junctions.length > 0) {
      if (key.upArrow || input === 'k') {
        setSelectedJunctionIndex((prev) => (prev - 1 + junctions.length) % junctions.length)
      } else if (key.downArrow || input === 'j') {
        setSelectedJunctionIndex((prev) => (prev + 1) % junctions.length)
      } else if (input === 'g') {
        setSelectedJunctionIndex(0)
      } else if (input === 'G') {
        setSelectedJunctionIndex(junctions.length - 1)
      }
    } else if (activeTab === 3 && warnings.length > 0) {
      if (key.upArrow || input === 'k') {
        setSelectedWarningIndex((prev) => (prev - 1 + warnings.length) % warnings.length)
      } else if (key.downArrow || input === 'j') {
        setSelectedWarningIndex((prev) => (prev + 1) % warnings.length)
      } else if (input === 'g') {
        setSelectedWarningIndex(0)
      } else if (input === 'G') {
        setSelectedWarningIndex(warnings.length - 1)
      } else if (key.return) {
        const chosen = warnings[selectedWarningIndex]
        if (chosen?.suggestedFixCommand) {
          setStatusMessage(`💡 Fix: ${chosen.suggestedFixCommand}`)
        }
      }
    } else if (activeTab === 5) {
      if (key.upArrow || input === 'k') {
        setConfigScrollOffset((prev) => Math.max(0, prev - 1))
      } else if (key.downArrow || input === 'j') {
        setConfigScrollOffset((prev) => prev + 1)
      } else if (input === 'g') {
        setConfigScrollOffset(0)
      } else if (input === 'G') {
        setConfigScrollOffset(100)
      } else if (input === 'o' || key.return) {
        await handleOpenConfigEditor('inline')
      } else if (input === 's') {
        await handleOpenConfigEditor('split')
      } else if (input === 'v' || input === 'V') {
        await handleOpenConfigEditor('tab')
      } else if (input === 'w') {
        await handleCycleWorkspace()
      }
    }
  })

  if (showSplash || !snapshot) {
    return (
      <BanyanSplash
        theme={theme}
        workspaceName={currentWorkspaceName}
        uptimeMs={Date.now() - bootStartRef.current}
        statusText={!snapshot ? t.scanning.trim() : undefined}
      />
    )
  }

  return (
    <Box flexDirection="column" paddingX={1} width={columns} height={rows - 1} overflow="hidden">
      <Box
        flexDirection="row"
        justifyContent="space-between"
        width={Math.max(60, columns - 2)}
        marginBottom={1}
        flexShrink={0}
      >
        <Box gap={2} alignItems="center" flexShrink={0} marginRight={2}>
          <Text color={theme.primary} bold wrap="truncate-end">
            {'\uf1bb'} B A N Y A N <Text color={theme.muted}>v{BANYAN_VERSION}</Text>
          </Text>
          {!isNarrow && (
            <Text color={theme.secondary} wrap="truncate-end">
              {'\uf418'}{' '}
              {columns < 145
                ? locale === 'es'
                  ? 'Control Políglota de Worktrees'
                  : 'Polyglot Worktree Control Plane'
                : t.subtitle}
            </Text>
          )}
        </Box>
        <Box flexShrink={1} overflow="hidden">
          <Text color={theme.muted} wrap="truncate-end">
            {columns < 145
              ? locale === 'es'
                ? '\uf05a [i] Leyenda  \uf065 [K] Nombre  \uf0eb [e] Explicar  \uf53f [t] Tema  \uf0ac [L] Idioma'
                : '\uf05a [i] Legend  \uf065 [K] Full Name  \uf0eb [e] Explain  \uf53f [t] Theme  \uf0ac [L] Lang'
              : t.headerHint}
          </Text>
        </Box>
      </Box>

      {pendingDeleteWt ? (
        <ConfirmModal
          locale={locale}
          title={
            locale === 'es'
              ? `¿Eliminar worktree [${pendingDeleteWt.id}]?`
              : `Delete worktree [${pendingDeleteWt.id}]?`
          }
          message={`${locale === 'es' ? 'Ruta' : 'Path'}: "${pendingDeleteWt.worktreePath}" (${pendingDeleteWt.branch})`}
          theme={theme}
          onConfirm={async () => {
            const target = pendingDeleteWt
            setPendingDeleteWt(null)
            const res = await removeWorktree(target.repoPath, target.worktreePath, false)
            setStatusMessage(res.ok ? `Removed ${target.id}` : `Error: ${res.error}`)
            await refresh(true)
          }}
          onCancel={() => setPendingDeleteWt(null)}
        />
      ) : pendingFixWarning ? (
        <ConfirmModal
          locale={locale}
          title={
            locale === 'es'
              ? `¿Ejecutar Auto-Fix para [${pendingFixWarning.warning.type}]?`
              : `Execute Auto-Fix for [${pendingFixWarning.warning.type}]?`
          }
          message={`${locale === 'es' ? 'Comando' : 'Command'}: "${pendingFixWarning.warning.suggestedFixCommand}"\n${locale === 'es' ? 'Directorio' : 'Directory'}: "${pendingFixWarning.cwd}"`}
          theme={theme}
          onConfirm={async () => {
            const target = pendingFixWarning
            setPendingFixWarning(null)
            setStatusMessage(
              locale === 'es' ? '⏳ Ejecutando auto-fix...' : '⏳ Executing auto-fix...',
            )
            const res = await executeFixCommand(target.warning.suggestedFixCommand!, target.cwd)
            if (res.ok) {
              setStatusMessage(
                locale === 'es'
                  ? '✔ Auto-fix ejecutado correctamente'
                  : '✔ Auto-fix executed successfully',
              )
              await refresh(true)
            } else {
              setStatusMessage(`❌ Fix error: ${res.error || res.stderr}`)
            }
          }}
          onCancel={() => setPendingFixWarning(null)}
        />
      ) : pendingCreateSourceWt ? (
        <CreateWorktreeModal
          sourceWorktree={pendingCreateSourceWt}
          theme={theme}
          locale={locale}
          onCreate={async ({ branch, targetPath, strategy }) => {
            const source = pendingCreateSourceWt
            setPendingCreateSourceWt(null)
            setStatusMessage(locale === 'es' ? '⏳ Creando worktree...' : '⏳ Creating worktree...')
            const res = await createWorktreeWithStrategy({
              repoPath: source.repoPath,
              branch,
              targetPath,
              strategy,
              sourceWorktree: source,
              allWorktrees: snapshot?.worktrees,
              junctions: snapshot?.junctions,
            })
            if (res.ok) {
              setStatusMessage(
                locale === 'es'
                  ? `✔ Worktree [${branch}] creado (${res.appliedLinksCount} enlaces aplicados)`
                  : `✔ Worktree [${branch}] created (${res.appliedLinksCount} links applied)`,
              )
              await refresh(true)
            } else {
              setStatusMessage(`❌ Error creando worktree: ${res.error}`)
            }
          }}
          onCancel={() => setPendingCreateSourceWt(null)}
        />
      ) : explainTopic ? (
        <ExplainModal
          topicId={explainTopic}
          locale={locale}
          theme={theme}
          onClose={() => setExplainTopic(null)}
          onCycleTopic={handleCycleTopic}
        />
      ) : showLegend ? (
        <LegendModal
          locale={locale}
          theme={theme}
          terminalColumns={columns}
          onClose={() => setShowLegend(false)}
        />
      ) : (
        <>
          {activeTab === 1 && (
            <WorktreeTab
              snapshot={snapshot}
              selectedIndex={selectedIndex}
              activePanel={activePanel}
              theme={theme}
              locale={locale}
              terminalRows={rows}
              terminalColumns={columns}
              isNarrow={isNarrow}
              filterMode={wtFilterMode}
              searchQuery={searchQuery}
              isSearchActive={isSearchActive}
              filteredWorktrees={filteredWorktrees}
              expandNames={expandNames}
            />
          )}
          {activeTab === 2 && (
            <JunctionTab
              snapshot={snapshot}
              selectedIndex={selectedJunctionIndex}
              theme={theme}
              locale={locale}
              terminalRows={rows}
              terminalColumns={columns}
              isNarrow={isNarrow}
              searchQuery={searchQuery}
              isSearchActive={isSearchActive}
              filteredJunctions={filteredJunctions}
              expandNames={expandNames}
            />
          )}
          {activeTab === 3 && (
            <HealthTab
              snapshot={snapshot}
              selectedIndex={selectedWarningIndex}
              theme={theme}
              locale={locale}
              terminalRows={rows}
              terminalColumns={columns}
              isNarrow={isNarrow}
            />
          )}
          {activeTab === 4 && <TutorialTab theme={theme} locale={locale} />}
          {activeTab === 5 && (
            <ConfigTab
              configPath={configPath}
              workspaceName={currentWorkspaceName}
              workspaceConfig={currentConfig}
              rawConfig={rawConfig}
              detectedEditor={detectedEditor}
              scrollOffset={configScrollOffset}
              theme={theme}
              locale={locale}
              isMuxActive={isMuxActive}
              isNarrow={isNarrow}
              snapshot={snapshot}
            />
          )}
        </>
      )}

      <StatusBar
        snapshot={snapshot}
        activeTab={activeTab}
        isRefreshing={isRefreshing}
        isAutoRefreshPaused={isAutoRefreshPaused}
        statusMessage={statusMessage}
        theme={theme}
        locale={locale}
        columns={columns}
      />
    </Box>
  )
}
