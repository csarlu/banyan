import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import path from 'node:path'
import { WorktreeNode } from '../../core/types.js'
import { ThemePalette } from '../theme.js'
import { Locale } from '../../i18n/index.js'
import { WorktreeLinkStrategy } from '../../core/worktreeCreator.js'

interface Props {
  sourceWorktree: WorktreeNode
  theme: ThemePalette
  locale: Locale
  onCreate: (params: { branch: string; targetPath: string; strategy: WorktreeLinkStrategy }) => void
  onCancel: () => void
}

export const CreateWorktreeModal: React.FC<Props> = ({
  sourceWorktree,
  theme,
  locale,
  onCreate,
  onCancel,
}) => {
  const [step, setStep] = useState<1 | 2>(1)
  const [branchInput, setBranchInput] = useState<string>('')
  const [selectedStrategyIdx, setSelectedStrategyIdx] = useState<number>(0)
  const isEs = locale === 'es'

  const strategies: { id: WorktreeLinkStrategy; label: string; desc: string }[] = [
    {
      id: 'clone-links',
      label: isEs
        ? '[1] Clonar enlaces locales (Recomendado)'
        : '[1] Clone local links (Recommended)',
      desc: isEs
        ? 'Recrea los mismos junctions apuntando a ramas alineadas o existentes.'
        : 'Recreates the same junctions pointing to aligned sibling branches if available.',
    },
    {
      id: 'shared-root',
      label: isEs ? '[2] Enlazar entorno compartido' : '[2] Link shared root env',
      desc: isEs
        ? 'Comparte node_modules o .venv directamente desde el worktree origen.'
        : 'Shares node_modules or .venv directly from the source worktree.',
    },
    {
      id: 'clean',
      label: isEs ? '[3] Worktree limpio' : '[3] Clean worktree',
      desc: isEs
        ? 'Crea el worktree sin ningún enlace ni entorno compartido.'
        : 'Creates the worktree with no shared links or environments.',
    },
  ]

  // Auto-suggest target directory
  const cleanBranch = branchInput.trim() || 'new-feature'
  const parentDir = path.dirname(sourceWorktree.worktreePath)
  const suggestedTargetPath = path.join(
    parentDir,
    `${sourceWorktree.repoAlias}-${cleanBranch.replace(/[\/\\]/g, '-')}`,
  )

  useInput((input, key) => {
    if (key.escape) {
      onCancel()
      return
    }

    if (step === 1) {
      if (key.return) {
        if (branchInput.trim().length > 0) {
          setStep(2)
        }
        return
      }
      if (key.backspace || key.delete) {
        setBranchInput((prev) => prev.slice(0, -1))
        return
      }
      if (input && !key.ctrl && !key.meta && input.length === 1) {
        setBranchInput((prev) => prev + input)
      }
    } else if (step === 2) {
      if (input === '1') {
        onCreate({ branch: cleanBranch, targetPath: suggestedTargetPath, strategy: 'clone-links' })
      } else if (input === '2') {
        onCreate({ branch: cleanBranch, targetPath: suggestedTargetPath, strategy: 'shared-root' })
      } else if (input === '3') {
        onCreate({ branch: cleanBranch, targetPath: suggestedTargetPath, strategy: 'clean' })
      } else if (key.upArrow || input === 'k') {
        setSelectedStrategyIdx((prev) => (prev - 1 + strategies.length) % strategies.length)
      } else if (key.downArrow || input === 'j') {
        setSelectedStrategyIdx((prev) => (prev + 1) % strategies.length)
      } else if (key.return) {
        onCreate({
          branch: cleanBranch,
          targetPath: suggestedTargetPath,
          strategy: strategies[selectedStrategyIdx].id,
        })
      }
    }
  })

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={theme.accent}
      paddingX={2}
      paddingY={1}
      flexGrow={1}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color={theme.accent}>
          🌱 {isEs ? 'Nuevo Git Worktree' : 'New Git Worktree'} [{sourceWorktree.repoAlias}]
        </Text>
        <Text color={theme.muted}>
          {step === 1
            ? isEs
              ? 'Paso 1 de 2: Nombre de rama'
              : 'Step 1 of 2: Branch name'
            : isEs
              ? 'Paso 2 de 2: Estrategia de enlaces'
              : 'Step 2 of 2: Link strategy'}
        </Text>
      </Box>

      {step === 1 ? (
        <Box flexDirection="column">
          <Text color={theme.text}>
            {isEs
              ? `Crear rama a partir de "${sourceWorktree.branch}" en:`
              : `Create branch off "${sourceWorktree.branch}" in:`}
          </Text>
          <Text color={theme.muted}> {sourceWorktree.worktreePath}</Text>

          <Box marginTop={1} borderStyle="single" borderColor={theme.accent} paddingX={1}>
            <Text bold color={theme.secondary}>
              {isEs ? 'Nombre de rama: ' : 'Branch name: '}
            </Text>
            <Text color={theme.text}>{branchInput}</Text>
            <Text color={theme.accent}>▎</Text>
          </Box>

          <Box marginTop={1}>
            <Text color={theme.muted}>
              📁 {isEs ? 'Ruta destino sugerida:' : 'Suggested target path:'}{' '}
              <Text color={theme.text}>{suggestedTargetPath}</Text>
            </Text>
          </Box>

          <Box marginTop={1}>
            <Text color={theme.muted}>
              {isEs
                ? 'Pulsa [Enter] para continuar o [Esc] para cancelar.'
                : 'Press [Enter] to continue or [Esc] to cancel.'}
            </Text>
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color={theme.primary}>
              {isEs
                ? 'Selecciona la estrategia de enlaces para el nuevo worktree:'
                : 'Select the linking strategy for the new worktree:'}
            </Text>
          </Box>

          {strategies.map((strat, idx) => {
            const isSelected = idx === selectedStrategyIdx
            return (
              <Box key={strat.id} flexDirection="column" marginBottom={1}>
                <Text bold={isSelected} color={isSelected ? theme.accent : theme.text}>
                  {isSelected ? '❯ ' : '  '}
                  {strat.label}
                </Text>
                <Text color={theme.muted}> {strat.desc}</Text>
              </Box>
            )
          })}

          <Box marginTop={1}>
            <Text color={theme.muted}>
              {isEs
                ? 'Pulsa [1 / 2 / 3] o [Enter] para crear, o [Esc] para cancelar.'
                : 'Press [1 / 2 / 3] or [Enter] to create, or [Esc] to cancel.'}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  )
}
