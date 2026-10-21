/**
 * Helpers to build suggested fix commands that are safe to display AND execute.
 *
 * Fix commands embed values that originate from untrusted repository content
 * (package names parsed from manifests, directory names, aliases) and are later
 * executed through a shell by `executeFixCommand` (TUI `[f]` and MCP `banyan_apply_fix`).
 * Every interpolated value must therefore go through one of these helpers.
 */

const isWin = process.platform === 'win32'

/** Newlines would terminate a `#` comment (or the command) and let the remainder execute. */
function stripNewlines(value: string): string {
  return value.replace(/[\r\n\u2028\u2029\0]+/g, ' ')
}

/**
 * Quotes a path/argument for the shell used by `executeFixCommand`
 * (PowerShell on Windows, `sh` elsewhere). Keeps the readable "double quote" style
 * when the value has no shell-active characters; otherwise falls back to single quotes.
 */
export function quoteArg(value: string): string {
  const v = stripNewlines(value)
  if (isWin) {
    return /["`$]/.test(v) ? `'${v.replace(/'/g, "''")}'` : `"${v}"`
  }
  return /["`$\\!]/.test(v) ? `'${v.replace(/'/g, `'\\''`)}'` : `"${v}"`
}

const SAFE_TOKEN = /^[A-Za-z0-9._~@%+=:,/\\-]+$/

/** Returns `value` if it only has characters that no shell treats specially, otherwise `null`. */
export function safeToken(value: string): string | null {
  return SAFE_TOKEN.test(value) ? value : null
}

/** Makes arbitrary text safe to embed in a `# comment` fix suggestion. */
export function commentSafe(value: string): string {
  return stripNewlines(value)
}
