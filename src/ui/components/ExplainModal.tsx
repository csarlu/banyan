import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { DocTopicId, DOC_TOPICS, KNOWLEDGE_BASE } from '../../docs/knowledgeBase.js'
import { Locale } from '../../i18n/index.js'
import { ThemePalette } from '../theme.js'

interface Props {
  topicId: DocTopicId
  locale: Locale
  theme: ThemePalette
  onClose: () => void
  onCycleTopic: (dir: 1 | -1) => void
}

export const ExplainModal: React.FC<Props> = ({
  topicId,
  locale,
  theme,
  onClose,
  onCycleTopic,
}) => {
  const [scrollOffset, setScrollOffset] = useState<number>(0)
  const dict = KNOWLEDGE_BASE[locale] || KNOWLEDGE_BASE.es
  const article = dict[topicId] || dict.concepts
  const isEs = locale === 'es'

  const currentIdx = DOC_TOPICS.indexOf(topicId)
  const displayIdx = currentIdx >= 0 ? currentIdx + 1 : 1

  useInput((input, key) => {
    if (key.escape || input === 'e' || input === 'q' || key.return) {
      onClose()
    } else if (key.rightArrow || input === 'l' || key.tab || input === ' ') {
      setScrollOffset(0)
      onCycleTopic(1)
    } else if (key.leftArrow || input === 'h') {
      setScrollOffset(0)
      onCycleTopic(-1)
    } else if (key.downArrow || input === 'j') {
      setScrollOffset((prev) => Math.min(prev + 1, 15))
    } else if (key.upArrow || input === 'k') {
      setScrollOffset((prev) => Math.max(0, prev - 1))
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
      {/* 1. Interactive topic pill bar */}
      <Box flexDirection="row" gap={1} marginBottom={1} flexWrap="wrap" flexShrink={0}>
        {DOC_TOPICS.map((tId, idx) => {
          const isCurrent = tId === topicId
          return (
            <Text key={tId} bold={isCurrent} color={isCurrent ? theme.accent : theme.muted}>
              {isCurrent ? '● ' : ''}[{idx + 1} {tId}]
            </Text>
          )
        })}
      </Box>

      {/* 2. Modal header and shortcuts */}
      <Box justifyContent="space-between" marginBottom={1} flexShrink={0}>
        <Text bold color={theme.primary} wrap="truncate-end">
          📖 [{article.code}] {article.title} ({displayIdx}/{DOC_TOPICS.length})
        </Text>
        <Text color={theme.muted}>
          {isEs
            ? '[h/l Tab] Temas  [j/k] Scroll  [Esc/e/Enter] Cerrar'
            : '[h/l Tab] Topics  [j/k] Scroll  [Esc/e/Enter] Close'}
        </Text>
      </Box>

      {/* 3. Article content with scroll offset */}
      {scrollOffset === 0 && (
        <Text color={theme.text} bold wrap="truncate-end">
          TL;DR: <Text color={theme.secondary}>{article.tlDr}</Text>
        </Text>
      )}

      {scrollOffset <= 1 && (
        <Box marginTop={1} flexDirection="column" flexShrink={0}>
          <Text bold color={theme.accent}>
            💡 {isEs ? 'Analogía:' : 'Analogy:'}
          </Text>
          <Text color={theme.text} wrap="truncate-end">
            {' '}
            {article.analogy}
          </Text>
        </Box>
      )}

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.border}
        paddingX={2}
        marginY={1}
        flexShrink={0}
      >
        {article.diagram.map((line, i) => (
          <Text key={i} color={theme.success} wrap="truncate-end">
            {line}
          </Text>
        ))}
      </Box>

      <Box flexDirection="column" flexShrink={0}>
        <Text bold color={theme.warning}>
          🤖 {isEs ? 'Impacto con Agentes en Paralelo:' : 'Why it matters for parallel Agents:'}
        </Text>
        {article.whyItMattersForAgents.map((line, i) => (
          <Text key={i} color={theme.text} wrap="truncate-end">
            {'  • '} {line}
          </Text>
        ))}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text bold color={theme.secondary}>
          🔧 {isEs ? 'Cómo actuar / Solución:' : 'How to fix:'}
        </Text>
        {article.howToFix.map((line, i) => (
          <Text key={i} color={theme.text} wrap="truncate-end">
            {'  • '} {line}
          </Text>
        ))}
      </Box>
    </Box>
  )
}
