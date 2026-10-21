import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { ThemePalette } from '../theme.js'
import { DICTIONARIES, Locale } from '../../i18n/index.js'

interface Props {
  theme: ThemePalette
  locale: Locale
}

export const TutorialTab: React.FC<Props> = ({ theme, locale }) => {
  const t = DICTIONARIES[locale].tutTab
  const [stepIdx, setStepIdx] = useState(0)
  const step = t.steps[stepIdx]

  useInput((input, key) => {
    if (key.rightArrow || input === ' ' || input === 'l') {
      setStepIdx((prev) => (prev + 1) % t.steps.length)
    } else if (key.leftArrow || input === 'h') {
      setStepIdx((prev) => (prev - 1 + t.steps.length) % t.steps.length)
    }
  })

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.borderActive}
      paddingX={2}
      paddingY={1}
      flexGrow={1}
      width="100%"
      overflow="hidden"
    >
      <Box justifyContent="space-between" marginBottom={1} width="100%" overflow="hidden">
        <Box flexShrink={1} overflow="hidden">
          <Text bold color={theme.primary} wrap="truncate-end">
            {t.title}
          </Text>
        </Box>
        <Box flexShrink={0} marginLeft={1}>
          <Text color={theme.accent} bold wrap="truncate-end">
            {t.nav}
          </Text>
        </Box>
      </Box>

      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={theme.border}
        paddingX={2}
        paddingY={1}
        width="100%"
        overflow="hidden"
      >
        <Text bold color={theme.secondary} wrap="truncate-end">
          {step.h}
        </Text>
        <Box flexDirection="column" marginY={1} width="100%" overflow="hidden">
          {step.b.map((line, i) => (
            <Text key={i} color={theme.text} wrap="truncate-end">
              {' '}
              {line}
            </Text>
          ))}
        </Box>

        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={theme.muted}
          paddingX={2}
          marginY={1}
          width="100%"
          overflow="hidden"
        >
          {step.d.map((line, i) => (
            <Text key={i} color={theme.success} wrap="truncate-end">
              {line}
            </Text>
          ))}
        </Box>

        <Text color={theme.warning} bold wrap="truncate-end">
          {' '}
          {step.tip}
        </Text>
      </Box>
    </Box>
  )
}
