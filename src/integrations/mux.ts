import { execFile, execSync } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export function getMuxBinaryName(): 'psmux' | 'tmux' {
  return process.platform === 'win32' ? 'psmux' : 'tmux'
}

export function isInMuxSession(): boolean {
  return Boolean(
    process.env.TMUX ||
    process.env.TMUX_PANE ||
    process.env.PSMUX_SESSION ||
    process.env.PSMUX_SESSION_NAME,
  )
}

export function isWindowsTerminalAvailable(): boolean {
  if (process.platform !== 'win32') return false
  try {
    execSync('where wt', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export function getPowerShellBinary(): string {
  if (process.platform !== 'win32') return 'powershell'
  try {
    execSync('where pwsh', { stdio: 'ignore' })
    return 'pwsh'
  } catch {
    return 'powershell'
  }
}

export async function isMuxAvailable(): Promise<boolean> {
  const bin = getMuxBinaryName()
  try {
    const versionArg = bin === 'tmux' ? '-V' : '--version'
    await execFileAsync(bin, [versionArg], { windowsHide: true })
    return true
  } catch {
    return false
  }
}

export async function getActiveMuxPaths(): Promise<Set<string>> {
  const paths = new Set<string>()
  const bin = getMuxBinaryName()
  try {
    const { stdout } = await execFileAsync(
      bin,
      ['list-panes', '-a', '-F', '#{pane_current_path}'],
      { windowsHide: true },
    )
    for (const line of stdout.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (trimmed) paths.add(trimmed)
    }
  } catch {
    // ni psmux ni tmux están corriendo o instalados
  }
  return paths
}

export async function openMuxSplit(
  targetPath: string,
  direction: 'h' | 'v' = 'h',
  command?: string | string[],
): Promise<boolean> {
  const bin = getMuxBinaryName()
  try {
    const flag = direction === 'h' ? '-h' : '-v'
    const args = ['split-window', flag, '-c', targetPath]
    if (bin === 'psmux') {
      const psBin = getPowerShellBinary()
      if (command) {
        const cmdStr = Array.isArray(command) ? command.join(' ') : command
        args.push('--', psBin, '-NoExit', '-Command', cmdStr)
      } else {
        args.push('--', psBin, '-NoExit')
      }
    } else {
      if (command) {
        if (Array.isArray(command)) {
          args.push(...command)
        } else {
          args.push(command)
        }
      }
    }
    await execFileAsync(bin, args, {
      windowsHide: true,
    })
    return true
  } catch {
    return false
  }
}

export async function openMuxWindow(
  targetPath: string,
  windowName?: string,
  command?: string | string[],
): Promise<boolean> {
  const bin = getMuxBinaryName()
  try {
    const args = ['new-window', '-c', targetPath]
    if (windowName) {
      args.push('-n', windowName)
    }
    if (bin === 'psmux') {
      const psBin = getPowerShellBinary()
      if (command) {
        const cmdStr = Array.isArray(command) ? command.join(' ') : command
        args.push('--', psBin, '-NoExit', '-Command', cmdStr)
      } else {
        args.push('--', psBin, '-NoExit')
      }
    } else {
      if (command) {
        if (Array.isArray(command)) {
          args.push(...command)
        } else {
          args.push(command)
        }
      }
    }
    await execFileAsync(bin, args, { windowsHide: true })
    return true
  } catch {
    return false
  }
}
