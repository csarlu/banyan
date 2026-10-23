import { exec, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { isExecutableFix } from './shellSafe.js'

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

export interface FixExecutionResult {
  ok: boolean
  command: string
  cwd: string
  stdout: string
  stderr: string
  error?: string
}

/**
 * Splits a shell command string on top-level `&&` operators (ignoring `&&` inside quotes).
 * Needed on Windows PowerShell 5.1 where `&&` is not a built-in statement separator.
 */
export function splitShellAndChain(command: string): string[] {
  const parts: string[] = []
  let current = ''
  let inSingle = false
  let inDouble = false

  for (let i = 0; i < command.length; i++) {
    const ch = command[i]
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle
      current += ch
      continue
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble
      current += ch
      continue
    }
    if (!inSingle && !inDouble && ch === '&' && command[i + 1] === '&') {
      const trimmed = current.trim()
      if (trimmed) parts.push(trimmed)
      current = ''
      i++
      continue
    }
    current += ch
  }

  const tail = current.trim()
  if (tail) parts.push(tail)
  return parts
}

/**
 * Executes a suggested collision fix command in the specified directory.
 * On Windows, runs each `&&`-chained step inside PowerShell with `-EncodedCommand`
 * so double quotes, paths with spaces, and `cmd /c` / `mklink` work reliably in PowerShell 5.1+.
 */
export async function executeFixCommand(
  command: string,
  cwd: string = process.cwd(),
): Promise<FixExecutionResult> {
  if (!isExecutableFix(command)) {
    return {
      ok: false,
      command,
      cwd,
      stdout: '',
      stderr: '',
      error: 'Manual hint or config snippet cannot be executed automatically',
    }
  }

  const isWindows = process.platform === 'win32'

  if (isWindows) {
    const steps = splitShellAndChain(command)
    const stdouts: string[] = []
    const stderrs: string[] = []

    try {
      for (const rawStep of steps) {
        const step = /^mklink\s/i.test(rawStep) ? `cmd /c ${rawStep}` : rawStep
        const psScript = `$ProgressPreference = 'SilentlyContinue'; $ErrorActionPreference = 'Stop'; $global:LASTEXITCODE = 0; ${step}; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }`
        const encoded = Buffer.from(psScript, 'utf16le').toString('base64')
        const { stdout, stderr } = await execFileAsync(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
          {
            cwd,
            windowsHide: true,
            maxBuffer: 1024 * 1024,
          },
        )
        if (stdout && stdout.trim()) stdouts.push(stdout.trim())
        if (stderr && stderr.trim()) stderrs.push(stderr.trim())
      }

      return {
        ok: true,
        command,
        cwd,
        stdout: stdouts.join('\n'),
        stderr: stderrs.join('\n'),
      }
    } catch (err: any) {
      if (err?.stdout && String(err.stdout).trim()) stdouts.push(String(err.stdout).trim())
      if (err?.stderr && String(err.stderr).trim()) stderrs.push(String(err.stderr).trim())
      return {
        ok: false,
        command,
        cwd,
        stdout: stdouts.join('\n'),
        stderr: stderrs.join('\n'),
        error: err?.message || 'Command execution failed',
      }
    }
  }

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    })
    return {
      ok: true,
      command,
      cwd,
      stdout: stdout ? stdout.trim() : '',
      stderr: stderr ? stderr.trim() : '',
    }
  } catch (err: any) {
    return {
      ok: false,
      command,
      cwd,
      stdout: err?.stdout ? String(err.stdout).trim() : '',
      stderr: err?.stderr ? String(err.stderr).trim() : '',
      error: err?.message || 'Command execution failed',
    }
  }
}
