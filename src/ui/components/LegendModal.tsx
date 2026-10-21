import React from 'react'
import { Box, Text, useInput } from 'ink'
import { ThemePalette } from '../theme.js'
import { Locale } from '../../i18n/index.js'
import { getEcosystemColor, getEcosystemIcon } from '../../core/adapters/index.js'
import { fitCell, UI_ICONS } from '../utils/formatters.js'

interface Props {
  locale: Locale
  theme: ThemePalette
  terminalColumns?: number
  onClose: () => void
}

export const LegendModal: React.FC<Props> = ({ locale, theme, terminalColumns = 120, onClose }) => {
  useInput((input, key) => {
    if (key.escape || key.return || input === 'i' || input === 'q' || input === ' ') {
      onClose()
    }
  })

  const isEs = locale === 'es'
  const boxWidth = Math.max(60, terminalColumns - 2)
  const innerWidth = Math.max(50, boxWidth - 4)
  const colWidth = Math.max(24, Math.floor((innerWidth - 3) / 2))
  const rightColWidth = innerWidth - 3 - colWidth

  const headerTitle = `${UI_ICONS.info} ${
    isEs
      ? 'LEYENDA VISUAL DE ICONOS, ROLES, SALUD Y ATAJOS'
      : 'VISUAL ICON, ROLE, HEALTH & KEYBINDING LEGEND'
  }`
  const headerHint = isEs ? '[i / Esc / Enter] Cerrar' : '[i / Esc / Enter] Close'
  const headerLeftBudget = Math.max(12, innerWidth - headerHint.length - 1)

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.accent}
      paddingX={1}
      width={boxWidth}
      overflow="hidden"
    >
      {/* Header */}
      <Text>
        <Text bold color={theme.accent}>
          {fitCell(headerTitle, headerLeftBudget, 'left')}
        </Text>
        <Text color={theme.muted}>{' ' + fitCell(headerHint, headerHint.length, 'right')}</Text>
      </Text>
      <Text color={theme.border}>{'─'.repeat(innerWidth)}</Text>

      {/* Row Group 1: Ecosystems (Left) | Worktree Roles & Envs (Right) */}
      <Text>
        <Text bold color={theme.secondary}>
          {fitCell(
            isEs ? '1. ECOSISTEMAS POLÍGLOTAS (DEVICONS)' : '1. POLYGLOT ECOSYSTEMS (DEVICONS)',
            colWidth,
          )}
        </Text>
        <Text color={theme.border}>{' │ '}</Text>
        <Text bold color={theme.secondary}>
          {fitCell(
            isEs ? '2. ROLES DE DEPENDENCIA Y ENTORNOS' : '2. DEPENDENCY ROLES & ENVIRONMENTS',
            rightColWidth,
          )}
        </Text>
      </Text>

      {/* Line 1 */}
      <Text>
        <Text color={getEcosystemColor('go')} bold>{`  ${getEcosystemIcon('go')}  `}</Text>
        <Text color={theme.text}>{fitCell('Go (go.mod replace / go.work)', colWidth - 5)}</Text>
        <Text color={theme.border}>{' │ '}</Text>
        <Text color={theme.accent} bold>{`  ${UI_ICONS.pkg} ref   `}</Text>
        <Text color={theme.text}>
          {fitCell(
            isEs
              ? 'Paquete Referenciado (consumido por otros)'
              : 'Referenced Package (consumed by others)',
            rightColWidth - 10,
          )}
        </Text>
      </Text>

      {/* Line 2 */}
      <Text>
        <Text color={getEcosystemColor('rust')} bold>{`  ${getEcosystemIcon('rust')}  `}</Text>
        <Text color={theme.text}>{fitCell('Rust (Cargo.toml path / target/)', colWidth - 5)}</Text>
        <Text color={theme.border}>{' │ '}</Text>
        <Text color={theme.secondary} bold>
          {'  ↳ dep   '}
        </Text>
        <Text color={theme.text}>
          {fitCell(
            isEs ? 'Consumidor (apunta a librerías locales)' : 'Consumer (links to local packages)',
            rightColWidth - 10,
          )}
        </Text>
      </Text>

      {/* Line 3 */}
      <Text>
        <Text color={getEcosystemColor('python')} bold>{`  ${getEcosystemIcon('python')}  `}</Text>
        <Text color={theme.text}>
          {fitCell('Python (pip -e / .pth / PYTHONPATH)', colWidth - 5)}
        </Text>
        <Text color={theme.border}>{' │ '}</Text>
        <Text color={theme.accent} bold>{`  ${UI_ICONS.link} nm    `}</Text>
        <Text color={theme.text}>
          {fitCell(
            isEs
              ? 'Entorno raíz compartido (nm / .venv / target)'
              : 'Shared root env (nm / .venv / target)',
            rightColWidth - 10,
          )}
        </Text>
      </Text>

      {/* Line 4 */}
      <Text>
        <Text color={getEcosystemColor('node')} bold>{`  ${getEcosystemIcon('node')}  `}</Text>
        <Text color={theme.text}>
          {fitCell('Node.js / TS (junctions / tsconfig)', colWidth - 5)}
        </Text>
        <Text color={theme.border}>{' │ '}</Text>
        <Text color={theme.muted} bold>{`  ${UI_ICONS.fork}       `}</Text>
        <Text color={theme.text}>
          {fitCell(
            isEs ? 'Worktree independiente (standalone)' : 'Standalone worktree (single branch)',
            rightColWidth - 10,
          )}
        </Text>
      </Text>

      {/* Line 5 */}
      <Text>
        <Text color={getEcosystemColor('dotnet')} bold>{`  ${getEcosystemIcon('dotnet')}  `}</Text>
        <Text color={theme.text}>
          {fitCell('.NET / C# (.csproj ProjectReference)', colWidth - 5)}
        </Text>
        <Text color={theme.border}>{' │ '}</Text>
        <Text color={theme.warning} bold>
          {'  [multi] '}
        </Text>
        <Text color={theme.text}>
          {fitCell(
            isEs
              ? 'Repositorio con ramas de distinto stack'
              : 'Repo with heterogeneous tech across branches',
            rightColWidth - 10,
          )}
        </Text>
      </Text>

      <Text color={theme.border}>{'─'.repeat(innerWidth)}</Text>

      {/* Row Group 2: Health & Git (Left) | Power Keybindings (Right) */}
      <Text>
        <Text bold color={theme.secondary}>
          {fitCell(
            isEs ? '3. AGENTES IA, COLISIONES Y GIT' : '3. AI AGENTS, COLLISIONS & GIT',
            colWidth,
          )}
        </Text>
        <Text color={theme.border}>{' │ '}</Text>
        <Text bold color={theme.secondary}>
          {fitCell(isEs ? '4. ATAJOS DE TECLADO RÁPIDOS' : '4. POWER KEYBINDINGS', rightColWidth)}
        </Text>
      </Text>

      {/* Line 1 */}
      <Text>
        <Text color={theme.agent} bold>{`  ${UI_ICONS.agent}       `}</Text>
        <Text color={theme.text}>
          {fitCell(
            isEs
              ? 'Agente IA activo (Claude, Codex, Aider...)'
              : 'Active AI Agent (Claude, Codex, Aider...)',
            colWidth - 10,
          )}
        </Text>
        <Text color={theme.border}>{' │ '}</Text>
        <Text color={theme.accent} bold>
          {'  [Shift+K] '}
        </Text>
        <Text color={theme.text}>
          {fitCell(
            isEs
              ? 'Alternar nombres completos vs compactos'
              : 'Toggle full untruncated names & paths',
            rightColWidth - 12,
          )}
        </Text>
      </Text>

      {/* Line 2 */}
      <Text>
        <Text color={theme.critical} bold>{`  ${UI_ICONS.critical} / ${UI_ICONS.warning}   `}</Text>
        <Text color={theme.text}>
          {fitCell(
            isEs
              ? 'Alerta de colisión crítica / advertencia'
              : 'Critical collision / branch mismatch alert',
            colWidth - 10,
          )}
        </Text>
        <Text color={theme.border}>{' │ '}</Text>
        <Text color={theme.accent} bold>
          {'  [f] / [y] '}
        </Text>
        <Text color={theme.text}>
          {fitCell(
            isEs
              ? 'Ejecutar Auto-Fix / Copiar ruta o comando'
              : 'Execute Auto-Fix / Copy path or fix cmd',
            rightColWidth - 12,
          )}
        </Text>
      </Text>

      {/* Line 3 */}
      <Text>
        <Text color={theme.success} bold>{`  ${UI_ICONS.check}       `}</Text>
        <Text color={theme.text}>
          {fitCell(
            isEs
              ? 'Árbol Git limpio (sin cambios pendientes)'
              : 'Clean Git working tree (0 uncommitted files)',
            colWidth - 10,
          )}
        </Text>
        <Text color={theme.border}>{' │ '}</Text>
        <Text color={theme.accent} bold>
          {'  [n] / [x] '}
        </Text>
        <Text color={theme.text}>
          {fitCell(
            isEs
              ? 'Crear nuevo worktree / Eliminar worktree'
              : 'Create new worktree / Delete worktree',
            rightColWidth - 12,
          )}
        </Text>
      </Text>

      {/* Line 4 */}
      <Text>
        <Text color={theme.warning} bold>{`  ${UI_ICONS.dirty}3      `}</Text>
        <Text color={theme.text}>
          {fitCell(
            isEs
              ? '3 archivos modificados sin commitear (dirty)'
              : '3 uncommitted modified/untracked files (dirty)',
            colWidth - 10,
          )}
        </Text>
        <Text color={theme.border}>{' │ '}</Text>
        <Text color={theme.accent} bold>
          {'  [a] / [s] '}
        </Text>
        <Text color={theme.text}>
          {fitCell(
            isEs
              ? 'Lanzar Agente IA / Abrir Split en tmux/psmux'
              : 'Spawn AI Agent / Open Split in tmux/psmux',
            rightColWidth - 12,
          )}
        </Text>
      </Text>

      {/* Line 5 */}
      <Text>
        <Text color={theme.secondary} bold>
          {'  ↑2↓1    '}
        </Text>
        <Text color={theme.text}>
          {fitCell(
            isEs
              ? '2 commits por delante, 1 por detrás de remoto'
              : '2 commits ahead, 1 behind remote branch',
            colWidth - 10,
          )}
        </Text>
        <Text color={theme.border}>{' │ '}</Text>
        <Text color={theme.accent} bold>
          {'  [/] / [F] '}
        </Text>
        <Text color={theme.text}>
          {fitCell(
            isEs
              ? 'Buscar por texto / Filtrar (Agentes, Dirty...)'
              : 'Live search / Cycle filter (Agents, Dirty...)',
            rightColWidth - 12,
          )}
        </Text>
      </Text>
    </Box>
  )
}
