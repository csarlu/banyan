import os from 'node:os'
import { WorktreeNode } from '../../core/types.js'

/**
 * Shortens filesystem paths for display in compact TUI mode:
 * - Replaces temporary polyglot playground prefixes with `~/playground`
 * - Replaces the user's home directory (`os.homedir()`) with `~`
 * When `expandNames` (`[Shift+K]`) is true, returns the full raw path.
 */
export function formatShortPath(inputPath?: string, expandNames: boolean = false): string {
  if (!inputPath) return ''
  if (expandNames) return inputPath

  const playgroundRegex =
    /(?:[A-Za-z]:[/\\]|\/)[^\s"'()[\]]*[/\\]banyan-polyglot-playground-[A-Za-z0-9_-]+([/\\][^\s"'()[\]]*)?/g
  let result = inputPath.replace(playgroundRegex, (_match, suffix) => {
    return '~/playground' + (suffix ? suffix.replace(/\\/g, '/') : '')
  })

  const home = os.homedir()
  if (home && result.toLowerCase().startsWith(home.toLowerCase())) {
    result = '~' + result.slice(home.length).replace(/\\/g, '/')
  }

  return result
}

/**
 * 1-cell BMP Nerd Font / Octicon / Lucide / Devicon glyphs.
 * Every icon here is a single BMP UTF-16 code unit (icon.length === 1)
 * and occupies strictly 1 terminal cell (stringWidth === 1), preventing
 * any vertical border sawtooth ("dientes de sierra") in Ink boxes.
 */
export const UI_ICONS = {
  banyan: '\uf1bb', //  Tree / Banyan
  worktree: '\uf418', //  Octicon git-branch / worktree
  branch: '\ue0a0', //  Powerline git branch
  fork: '\uf126', //  Code fork
  commit: '\uf417', //  Octicon git-commit
  repo: '\uf401', //  Octicon repo
  pkg: '\uf487', //  Octicon package / box
  consumer: '\uf019', //  Consumer / incoming download
  link: '\uf0c1', //  Symlink / junction
  broken: '\uf127', //  Broken link
  folder: '\uf07b', //  Folder
  folderOpen: '\uf07c', //  Open folder / path
  agent: '\uf544', //  Robot / AI agent
  shield: '\uf132', //  Shield / health
  critical: '\uf06a', //  Exclamation circle / critical
  warning: '\uf071', //  Warning triangle (BMP, no FE0F!)
  bulb: '\uf0eb', //  Lightbulb / auto-fix
  copy: '\uf0c5', //  Copy / yank
  search: '\uf002', //  Search
  filter: '\uf0b0', //  Filter funnel
  tag: '\uf02b', //  Role / tag
  layers: '\uf5fd', //  Environment layers
  gear: '\uf013', //  Config gear
  book: '\uf02d', //  Tutorial / docs book
  palette: '\uf53f', //  Theme palette
  globe: '\uf0ac', //  Language globe
  bolt: '\uf0e7', //  Live bolt
  pause: '\uf04c', //  Pause
  sync: '\uf021', //  Refresh / scanning
  expand: '\uf065', //  Expand full names (Shift+K)
  compress: '\uf066', //  Compact names (Shift+K)
  check: '\uf00c', //  Clean check
  dirty: '\uf444', //  Dirty dot
  inspector: '\uf469', //  Inspector pulse
  info: '\uf05a', //  Info / Legend
  terminal: '\uf120', //  Terminal command
} as const

/**
 * Strips all ANSI escape sequences (colors, cursor movements, etc.) from a string.
 */
export function stripAnsiCodes(input: string): string {
  if (!input) return ''
  return input.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
}

/**
 * Returns a compact display label for a worktree.
 * If the worktree is the primary/root repo (e.g. relPath === repoAlias,
 * or id === 'repo:repo'), returns 'repo' instead of redundant 'repo:repo'.
 * Subpaths remain 'repo:subpath'.
 */
export function formatWorktreeLabel(wt: WorktreeNode): string {
  if (!wt) return ''
  const isSelf =
    wt.relPath === wt.repoAlias ||
    wt.id === `${wt.repoAlias}:${wt.repoAlias}` ||
    wt.id === `${wt.repoAlias}:` ||
    !wt.relPath ||
    wt.relPath === '.'

  return isSelf ? wt.repoAlias : wt.id
}

/**
 * Formats a worktree ID string (e.g. 'rust-compute-core:rust-compute-core')
 * into a concise label ('rust-compute-core') when repoAlias and subpath are identical.
 */
export function formatWorktreeIdString(wtId?: string): string {
  if (!wtId) return ''
  const colonIdx = wtId.indexOf(':')
  if (colonIdx === -1) return wtId
  const repo = wtId.slice(0, colonIdx)
  const sub = wtId.slice(colonIdx + 1)
  if (!sub || sub === '.' || sub === repo) {
    return repo
  }
  return wtId
}

/**
 * Sanitizes a string so that every character is guaranteed to occupy
 * strictly 1 terminal cell in all monospace fonts and terminal emulators.
 *
 * 1. Strips full ANSI escape sequences first (so `\x1b[33m` never leaves `[33m` behind!)
 * 2. Preserves 1-cell BMP Nerd Font / Lucide / Devicon glyphs (U+E000..U+F8FF)
 *    and standard Box Drawing / Geometric symbols
 * 3. Strips 2-unit surrogate-pair emojis and variation selectors (U+FE0E/U+FE0F).
 */
export function sanitizeSingleWidth(input: string): string {
  if (!input) return ''
  const noAnsi = stripAnsiCodes(input)
  let out = ''
  for (let i = 0; i < noAnsi.length; i++) {
    const code = noAnsi.charCodeAt(i)

    // Surrogate pairs (multi-byte emojis U+1F300..U+1FAFF and Supplementary PUA) -> skip both code units
    // so string.length === 1-cell terminal column count is strictly preserved
    if (code >= 0xd800 && code <= 0xdbff) {
      if (i + 1 < noAnsi.length) {
        const low = noAnsi.charCodeAt(i + 1)
        if (low >= 0xdc00 && low <= 0xdfff) {
          i++
        }
      }
      continue
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      continue
    }

    // Variation selectors (U+FE00..U+FE0F) and zero-width joiners (cause 1-cell ConPTY drift)
    if ((code >= 0xfe00 && code <= 0xfe0f) || code === 0x200d || code === 0x200b) {
      continue
    }

    // Tabs / newlines -> single space
    if (code === 0x09 || code === 0x0a || code === 0x0d) {
      out += ' '
      continue
    }

    // Standard printable ASCII (0x20..0x7E)
    if (code >= 0x20 && code <= 0x7e) {
      out += noAnsi[i]
      continue
    }

    // Latin-1 Supplement & Latin Extended-A (Spanish accents: á, é, í, ó, ú, ñ, ü, ¿, ¡)
    if (code >= 0x00a1 && code <= 0x017f) {
      out += noAnsi[i]
      continue
    }

    // BMP Private Use Area (U+E000..U+F8FF: Nerd Fonts / Lucide / Devicons / Octicons)
    // All BMP PUA icons have .length === 1 and stringWidth === 1
    if (code >= 0xe000 && code <= 0xf8ff) {
      out += noAnsi[i]
      continue
    }

    // Standard Box Drawing, Block Elements, Geometric Shapes, Arrows & Dingbats (1-cell BMP glyphs)
    // Note: U+25B6 (▶) and U+25C0 (◀) are classified as 2-cell emoji-presentation by `string-width` in Ink,
    // which causes Ink to wrap `fitCell` lines onto a blank second line. Map them to U+25B8 (▸) and U+25C2 (◂),
    // which are strictly 1-cell in both `string-width` and all terminal fonts.
    if (code === 0x25b6) {
      out += '\u25b8'
      continue
    }
    if (code === 0x25c0) {
      out += '\u25c2'
      continue
    }
    if (code >= 0x2190 && code <= 0x27bf) {
      out += noAnsi[i]
      continue
    }
  }
  return out
}

export interface ParsedGitGraphLine {
  graph: string
  sha: string
  refs: string
  subject: string
}

/**
 * Parses a raw `git log --oneline --graph --decorate` or `git-graph` line
 * (potentially containing ANSI codes) into structured, clean 1-cell components
 * with box-drawing rails (`●`, `│`, `╭`, `╰`, `─`) for crisp Ink rendering.
 */
export function parseGitGraphLine(rawLine: string): ParsedGitGraphLine {
  const clean = sanitizeSingleWidth(rawLine)

  // Match leading graph characters (*, |, /, \, _, -, space, ●, ○, │, ─, ╭, ╮, ╯, ╰, ├, ┤, ┬, ┴, ┼)
  const match = clean.match(
    /^([*|/\\_\-\s●○│─╭╮╯╰├┤┬┴┼]+?)(?:([0-9a-f]{7,12})\b\s*(?:\(([^)]+)\)\s*)?(.*))?$/,
  )

  const beautifyRails = (rails: string): string =>
    rails
      .replace(/\*/g, '●')
      .replace(/\|\\/g, '├─╮')
      .replace(/\|\//g, '├─╯')
      .replace(/\|/g, '│')
      .replace(/\\/g, '╰')
      .replace(/\//g, '╭')

  if (!match) {
    return {
      graph: '● ',
      sha: '',
      refs: '',
      subject: clean.trim(),
    }
  }

  const rawGraph = match[1] || ''
  const sha = match[2] || ''
  const refs = match[3] ? `(${match[3]})` : ''
  const subject = (match[4] || '').trim()

  // Pure connector line (e.g. `| \` or `|/`) with no commit SHA
  if (!sha && !subject) {
    return {
      graph: beautifyRails(clean),
      sha: '',
      refs: '',
      subject: '',
    }
  }

  return {
    graph: beautifyRails(rawGraph),
    sha,
    refs,
    subject,
  }
}

/**
 * Reserves an exact `width`-character slot for `text`.
 * - Sanitizes to strict 1-cell characters (and strips ANSI codes)
 * - Truncates with `..` if longer than `width`
 * - Pads with spaces (`padEnd` for left, `padStart` for right) so
 *   `fitCell(text, width).length === width` is ALWAYS true.
 */
export function fitCell(text: string, width: number, align: 'left' | 'right' = 'left'): string {
  const targetWidth = Math.max(0, Math.floor(width))
  if (targetWidth === 0) return ''

  const clean = sanitizeSingleWidth(text)
  if (clean.length > targetWidth) {
    if (targetWidth <= 2) {
      return clean.slice(0, targetWidth)
    }
    return clean.slice(0, targetWidth - 2) + '..'
  }
  if (clean.length < targetWidth) {
    return align === 'right' ? clean.padStart(targetWidth, ' ') : clean.padEnd(targetWidth, ' ')
  }
  return clean
}

/**
 * Formats `[name]` into an exact `width`-character slot.
 * If `name` is too long to fit inside `[...]` within `width`, trims `name` with `..`
 * inside the brackets (e.g. `[my-long-repo..]`) and pads trailing spaces to `width`.
 */
export function formatBracketedName(name: string, width: number): string {
  const targetWidth = Math.max(4, Math.floor(width))
  const clean = sanitizeSingleWidth(name)
  const maxInner = targetWidth - 2 // reserve 2 chars for '[' and ']'

  let bracketed: string
  if (clean.length > maxInner) {
    if (maxInner <= 2) {
      bracketed = `[${clean.slice(0, maxInner)}]`
    } else {
      bracketed = `[${clean.slice(0, maxInner - 2)}..]`
    }
  } else {
    bracketed = `[${clean}]`
  }

  return bracketed.padEnd(targetWidth, ' ')
}

/**
 * Wraps a long untruncated string across up to `maxLines` lines, each padded to
 * exact `width` characters, with `indent` spaces on continuation lines.
 * Used when `Shift+K` (`expandNames`) is toggled to inspect full untruncated names/paths,
 * and in the Health & Junctions detail panels.
 */
export function wrapCellLines(
  text: string,
  width: number,
  indent: number = 0,
  maxLines: number = 3,
): string[] {
  const targetWidth = Math.max(10, Math.floor(width))
  const safeIndent = Math.min(Math.max(0, indent), targetWidth - 4)
  const clean = sanitizeSingleWidth(text)

  if (clean.length <= targetWidth) {
    return [clean.padEnd(targetWidth, ' ')]
  }

  const lines: string[] = []
  let cursor = 0

  while (cursor < clean.length && lines.length < maxLines) {
    const isFirst = lines.length === 0
    const isLastAllowed = lines.length === maxLines - 1
    const prefix = isFirst ? '' : ' '.repeat(safeIndent)
    const chunkBudget = targetWidth - prefix.length
    const remaining = clean.length - cursor

    if (remaining <= chunkBudget) {
      const chunk = clean.slice(cursor)
      lines.push((prefix + chunk).padEnd(targetWidth, ' '))
      break
    }

    if (isLastAllowed) {
      const sliceLen = Math.max(1, chunkBudget - 2)
      const chunk = clean.slice(cursor, cursor + sliceLen) + '..'
      lines.push((prefix + chunk).padEnd(targetWidth, ' '))
      break
    }

    const chunk = clean.slice(cursor, cursor + chunkBudget)
    lines.push((prefix + chunk).padEnd(targetWidth, ' '))
    cursor += chunkBudget
  }

  return lines
}
