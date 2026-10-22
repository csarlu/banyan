import React from 'react'
import { Box, Text } from 'ink'
import { BANYAN_VERSION } from '../version.js'

const CANOPY_LINES = [
  '                       %%%%%%..                        ',
  '                 %%%% %%%%%%%%▓....░%..                ',
  '              %%%%%%%#@@@@@@#**# %▒░░▓▒.               ',
  '           %%%%%%%%%@ ▓# ;*;;;:  %▓▒░░▓%               ',
  '        % %%%%%%%%@%%# ▒:;::: ░## ▓▓▒░░##..            ',
  '      %%%%%░▓%%%%#%%* **;;;;;## #####▓*;▓#░#.....      ',
  '    %%%%%%% ░░▒▓ ##*  ##█ ░%# #*;*## :... ..░▓▒░░.     ',
  '    %%%% ## % ##▓ * # * #%%█%%%,*#; ## .. ═ ▓.░▒▓▓▓%.  ',
  '      %%****;;;;:*%%  #:%@@@@@##  :;:; ░██▒  ;;*;:;░▒. ',
  '  %%%%%%% *#%# %%%%%\\ █ ;,;: ░░▓▒ █ #; ░██▒ ▓▓▓░...▓▒░ ',
  ' %%%%%%%%#▓% ░%* %%%%\\..  # *  :/# #░▓▒ ;;;: ▓▓▒░░░▒▓▒:',
  '%%%%%%;#░%%▓*%(  ░   ;;o \\\\ \\.   //  *:;*%  █ %▒▓▒.*;,░',
  '%▒▓░▓.#*───┬──────:     * ::  \\  │/   :/    /┌─:*%@%*@%',
  ' ; ░ * #:# ▒▓#────o──┼──┐  \\ \\ │ │  / / ──┼─o┼──%%@@@##',
]

const ROOTS_LINES = [
  '  ; │ #;─┼/││ │  │  │  │   \\ \\│ │ / /─// │  │  *;┬;·;; │',
  '    │ │  │ ││ │  │  │  │    \\ │o│/ /  │  │  │    │     │',
  '    │ │  │ ╰╯ │  │  │  │    │ │ │o │  │  ╰o │    │     │',
  '    │ ╰o │    │  │  │  │    │o│ │  │  │   │ │    │  │  │',
  '    ╵  │ ╵    │  ╵  ╵  │  / │ │ │\\ │  ╵   ╵ │    │  ╵  ╵',
  '              ╵     ..─┴─/──┼─│─│─┴┴─..     ╵    ╵      ',
  '           ..──┬───/───/─┼──/ │ │ \\──\\─\\───┬──..        ',
  '       .──┼────o──/───┼──/ /  │ │  \\ ─┼─\\──┼────┼──.    ',
  '     +───/──/    /   /┼ / / │ │o│ │ \\  \\ \\  \\─┼───\\──+  ',
  '      / o  /  ──┼┼─ / │/ /  ├─│ │ │  \\  \\ ┼  \\ \\   \\    ',
  '     +    /    /   /  o /  /  │ │  \\  \\  o \\  \\ +   +   ',
  '         +    /   │  / │  /  /│ │\\  \\  \\ │  \\  \\        ',
  '             /    o  │ o /  o │ │ \\  \\  o│   \\  +       ',
  '             ╵    ╵  o ╵    ╵ │ │  ╵  o  ╵    ╵         ',
]

const LOGO_LINES = [
  '██████╗  █████╗ ███╗   ██╗██╗   ██╗ █████╗ ███╗   ██╗',
  '██╔══██╗██╔══██╗████╗  ██║╚██╗ ██╔╝██╔══██╗████╗  ██║',
  '██████╔╝███████║██╔██╗ ██║ ╚████╔╝ ███████║██╔██╗ ██║',
  '██╔══██╗██╔══██║██║╚██╗██║  ╚██╔╝  ██╔══██║██║╚██╗██║',
  '██████╔╝██║  ██║██║ ╚████║   ██║   ██║  ██║██║ ╚████║',
  '╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═══╝',
]

import { ThemePalette } from './theme.js'

const GradientLine: React.FC<{ line: string; leftColor?: string; rightColor?: string }> = ({
  line,
  leftColor = '#00ff66',
  rightColor = '#00e5ff',
}) => {
  const mid = Math.floor(line.length / 2)
  return (
    <Text>
      <Text color={leftColor}>{line.slice(0, mid)}</Text>
      <Text color={rightColor}>{line.slice(mid)}</Text>
    </Text>
  )
}

export interface BanyanSplashProps {
  uptimeMs?: number
  theme?: ThemePalette
  statusText?: string
  workspaceName?: string
}

export const BanyanSplash: React.FC<BanyanSplashProps> = ({
  uptimeMs = 21,
  theme,
  statusText,
  workspaceName,
}) => {
  const primary = theme?.primary || '#22ff66'
  const secondary = theme?.secondary || '#00e5ff'
  const accent = theme?.accent || '#33ffcc'
  const muted = theme?.muted || '#2eb872'
  const border = theme?.border || '#1a6644'

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={border} paddingX={2} paddingY={0}>
      <Box justifyContent="space-between" marginBottom={0}>
        <Text color={muted}>
          [BANYAN v{BANYAN_VERSION}
          {workspaceName ? ` · ws:${workspaceName}` : ''}]
        </Text>
        <Text color={muted}>[uptime = {uptimeMs}ms]</Text>
      </Box>

      <Box flexDirection="column" alignItems="center">
        {CANOPY_LINES.map((line, i) => (
          <GradientLine key={`c-${i}`} line={line} leftColor={primary} rightColor={accent} />
        ))}
        {ROOTS_LINES.map((line, i) => (
          <GradientLine key={`r-${i}`} line={line} leftColor={primary} rightColor={secondary} />
        ))}
        <Box marginTop={1} flexDirection="column">
          {LOGO_LINES.map((line, i) => (
            <GradientLine key={`l-${i}`} line={line} leftColor={accent} rightColor={secondary} />
          ))}
        </Box>
      </Box>

      <Box justifyContent="space-between" marginTop={0}>
        <Text color={statusText ? accent : muted} bold={Boolean(statusText)}>
          {statusText
            ? `[⏳ ${statusText}]`
            : '[Polyglot Agentic Worktree & Dependency Control Plane]'}
        </Text>
        <Text color={muted}>[system load █▓░]</Text>
      </Box>
    </Box>
  )
}
