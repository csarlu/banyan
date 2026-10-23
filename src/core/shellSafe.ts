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

/**
 * Returns true when `command` is an actual shell command that can be executed,
 * and false when it is empty or a manual hint / config snippet (`# ...`).
 */
export function isExecutableFix(command?: string): boolean {
  if (!command) return false
  const trimmed = command.trim()
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('{')) return false
  return true
}

/**
 * Builds a shell-safe in-place text replacement command for manifest/config files
 * (`Cargo.toml`, `.cargo/config.toml`, `.env`, `.pth`, `.egg-link`, `.vscode/settings.json`),
 * falling back to a `# comment` hint when either token contains shell metacharacters.
 */
export function buildFileReplaceCommand(
  filePath: string,
  oldStr: string,
  newStr: string,
  fallbackComment: string,
): string {
  if (!oldStr || !newStr || oldStr === newStr || !safeToken(oldStr) || !safeToken(newStr)) {
    return `# ${commentSafe(fallbackComment)}`
  }
  if (isWin) {
    return `(Get-Content -Raw -LiteralPath ${quoteArg(filePath)}).Replace(${quoteArg(oldStr)}, ${quoteArg(newStr)}) | Set-Content -NoNewline -LiteralPath ${quoteArg(filePath)}`
  }
  const escapedOld = oldStr.replace(/[.\\]/g, '\\$&')
  const escapedNew = newStr.replace(/[&\\]/g, '\\$&')
  const sedExpr = quoteArg(`s|${escapedOld}|${escapedNew}|g`)
  if (process.platform === 'darwin') {
    return `sed -i '' ${sedExpr} ${quoteArg(filePath)}`
  }
  return `sed -i ${sedExpr} ${quoteArg(filePath)}`
}
