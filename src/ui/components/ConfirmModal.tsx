import React from 'react'
import { Box, Text, useInput } from 'ink'
import { ThemePalette } from '../theme.js'
import { Locale } from '../../i18n/index.js'
import { getMessages } from '../../i18n/messages.js'

interface Props {
  title: string
  message: string
  theme?: ThemePalette
  locale?: Locale
  onConfirm: () => void
  onCancel: () => void
}

export const ConfirmModal: React.FC<Props> = ({
  title,
  message,
  theme,
  locale = 'en',
  onConfirm,
  onCancel,
}) => {
  const cm = getMessages(locale).confirm
  useInput((input, key) => {
    if (key.return || input.toLowerCase() === 'y' || input.toLowerCase() === 's') {
      onConfirm()
    } else if (key.escape || input.toLowerCase() === 'n') {
      onCancel()
    }
  })

  const critColor = theme?.critical || 'redBright'
  const okColor = theme?.success || 'greenBright'
  const secColor = theme?.secondary || 'cyanBright'
  const warnColor = theme?.warning || 'yellow'
  const textColor = theme?.text || 'white'

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={critColor}
      paddingX={2}
      paddingY={1}
      marginY={1}
    >
      <Text bold color={critColor}>
        ⚠️ {title}
      </Text>
      <Box marginY={1}>
        <Text color={textColor}>{message}</Text>
      </Box>
      <Text color={warnColor}>
        {cm.press}{' '}
        <Text bold color={okColor}>
          {cm.confirmKeys}
        </Text>{' '}
        {cm.toConfirm}{' '}
        <Text bold color={secColor}>
          {cm.cancelKeys}
        </Text>{' '}
        {cm.toCancel}
      </Text>
    </Box>
  )
}
