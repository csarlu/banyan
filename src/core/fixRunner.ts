import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

export interface FixExecutionResult {
  ok: boolean
  command: string
  cwd: string
  stdout: string
  stderr: string
  error?: string
}

/**
 * Executes a suggested collision fix command in the specified directory.
 * On Windows, runs inside PowerShell to natively support cmd/mklink/Remove-Item commands.
 */
export async function executeFixCommand(
  command: string,
  cwd: string = process.cwd(),
): Promise<FixExecutionResult> {
  const isWindows = process.platform === 'win32'
  const shell = isWindows ? 'powershell.exe' : undefined

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      shell,
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
