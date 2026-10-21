import React from 'react'
import { Box, Text } from 'ink'
import { ThemePalette } from '../theme.js'

export type JsonTokenType =
  | 'key'
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'bracket'
  | 'colon'
  | 'comma'
  | 'whitespace'
  | 'text'

export interface JsonToken {
  text: string
  type: JsonTokenType
}

export function tokenizeJsonLine(line: string): JsonToken[] {
  const tokens: JsonToken[] = []
  const regex =
    /("(?:[^"\\]|\\.)*")|(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|\b(true|false)\b|\bnull\b|([{}[\].])|(:)|(,)|(\s+)|([^\s"{}[\],:]+)/g

  let match: RegExpExecArray | null
  while ((match = regex.exec(line)) !== null) {
    const [full, str, num, bool, bracket, colon, comma, space] = match
    if (space) {
      tokens.push({ text: full, type: 'whitespace' })
    } else if (colon) {
      tokens.push({ text: full, type: 'colon' })
    } else if (comma) {
      tokens.push({ text: full, type: 'comma' })
    } else if (bracket) {
      tokens.push({ text: full, type: 'bracket' })
    } else if (num) {
      tokens.push({ text: full, type: 'number' })
    } else if (bool) {
      tokens.push({ text: full, type: 'boolean' })
    } else if (full === 'null') {
      tokens.push({ text: full, type: 'null' })
    } else if (str) {
      const rest = line.slice(regex.lastIndex).trimStart()
      const isKey = rest.startsWith(':')
      tokens.push({ text: full, type: isKey ? 'key' : 'string' })
    } else {
      tokens.push({ text: full, type: 'text' })
    }
  }

  if (tokens.length === 0 && line.length > 0) {
    tokens.push({ text: line, type: 'text' })
  }

  return tokens
}

export function getJsonTokenColor(type: JsonTokenType, theme: ThemePalette): string | undefined {
  switch (type) {
    case 'key':
      return theme.secondary
    case 'string':
      return theme.success
    case 'number':
      return theme.warning
    case 'boolean':
      return theme.agent
    case 'null':
      return theme.critical
    case 'bracket':
      return theme.primary
    case 'colon':
    case 'comma':
      return theme.muted
    case 'text':
      return theme.text
    case 'whitespace':
    default:
      return undefined
  }
}

interface JsonLineProps {
  line: string
  lineNum: number
  theme: ThemePalette
}

export const JsonLineView: React.FC<JsonLineProps> = ({ line, lineNum, theme }) => {
  const tokens = tokenizeJsonLine(line)

  return (
    <Box width="100%" overflow="hidden">
      <Text wrap="truncate-end">
        <Text color={theme.muted}>{String(lineNum).padStart(3, ' ')} │ </Text>
        {tokens.map((tok, idx) => (
          <Text
            key={idx}
            color={getJsonTokenColor(tok.type, theme)}
            bold={tok.type === 'key' || tok.type === 'boolean'}
          >
            {tok.text}
          </Text>
        ))}
      </Text>
    </Box>
  )
}
