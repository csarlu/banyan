import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execSync, spawn, spawnSync } from 'node:child_process'
import { BanyanConfig } from './types.js'
import {
  isInMuxSession,
  isMuxAvailable,
  isWindowsTerminalAvailable,
  openMuxSplit,
} from '../integrations/mux.js'

export function detectEditor(): string {
  if (process.env.BANYAN_EDITOR) return process.env.BANYAN_EDITOR

  // 1. First choice: prefer Neovim if available on the system
  const isWindows = process.platform === 'win32'
  try {
    const checkCmd = isWindows ? 'where nvim' : 'which nvim'
    execSync(checkCmd, { stdio: 'ignore' })
    return 'nvim'
  } catch {
    // nvim not found in PATH
  }

  // 2. Fall back to environment default editor
  if (process.env.VISUAL) return process.env.VISUAL
  if (process.env.EDITOR) return process.env.EDITOR

  // 3. Fall back to system candidates
  const candidates = isWindows ? ['vim', 'code', 'notepad'] : ['vim', 'nano', 'vi']
  for (const cmd of candidates) {
    try {
      const checkCmd = isWindows ? `where ${cmd}` : `which ${cmd}`
      execSync(checkCmd, { stdio: 'ignore' })
      return cmd
    } catch {
      // Candidate not available
    }
  }

  return isWindows ? 'notepad' : 'vi'
}

export function findConfigFile(cwd: string = process.cwd()): string | null {
  const candidates = [
    path.join(cwd, 'banyan.config.json'),
    path.join(cwd, '.banyanrc.json'),
    path.join(os.homedir(), '.config', 'banyan', 'banyan.config.json'),
    path.join(os.homedir(), '.banyanrc.json'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

export function createDefaultConfig(targetPath: string): string {
  const dir = path.dirname(targetPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const sampleConfig: BanyanConfig = {
    $schema: 'https://banyan.dev/schema/v1.json',
    defaultWorkspace: 'default',
    workspaces: {
      default: {
        root: '.',
        discoverSubdirs: true,
        repos: [],
        adapters: {
          node: {
            enabled: 'auto',
            highlightScopes: [],
          },
        },
        agentDetection: {
          lockFiles: ['.aider*', '.claude*', '.cursor*'],
          recentModifiedThresholdSec: 45,
        },
      },
    },
  }

  fs.writeFileSync(targetPath, JSON.stringify(sampleConfig, null, 2), 'utf-8')
  return targetPath
}

export function findOrCreateConfigFile(cwd: string = process.cwd()): string {
  const existing = findConfigFile(cwd)
  if (existing) return existing
  const target = path.join(cwd, 'banyan.config.json')
  return createDefaultConfig(target)
}

export function readConfigFileRaw(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
}

export type OpenEditorTarget = 'inline' | 'split' | 'tab'

export interface OpenEditorResult {
  ok: boolean
  editor: string
  filePath: string
  mode: OpenEditorTarget | 'external'
  error?: string
}

function isTerminalEditor(cmd: string): boolean {
  const base = path
    .basename(cmd)
    .toLowerCase()
    .replace(/\.exe$/, '')
  return ['nvim', 'vim', 'vi', 'nano', 'emacs', 'kak', 'helix', 'hx', 'micro'].includes(base)
}

export async function openConfigInEditor(
  cwd: string = process.cwd(),
  customEditor?: string,
  targetMode: OpenEditorTarget = 'inline',
): Promise<OpenEditorResult> {
  const filePath = findOrCreateConfigFile(cwd)
  const editor = customEditor || detectEditor()
  const fileDir = path.dirname(filePath)
  const isTui = isTerminalEditor(editor)

  // 1. If split requested in psmux / tmux
  if (targetMode === 'split') {
    const inMux = isInMuxSession() || (await isMuxAvailable())
    if (!inMux) {
      return {
        ok: false,
        editor,
        filePath,
        mode: 'split',
        error: 'No active psmux/tmux session available for split pane',
      }
    }
    const ok = await openMuxSplit(fileDir, 'h', [editor, filePath])
    return {
      ok,
      editor,
      filePath,
      mode: 'split',
      error: ok ? undefined : 'Failed to launch editor in psmux/tmux split',
    }
  }

  // 2. If in a multiplexer session (psmux/tmux), always open cleanly in split or window
  if (isInMuxSession()) {
    const ok = await openMuxSplit(fileDir, 'h', [editor, filePath])
    if (ok) {
      return { ok: true, editor, filePath, mode: 'split' }
    }
  }

  // 3. For Windows environments
  if (process.platform === 'win32') {
    // 3a. If it's a GUI editor (like code or notepad), launch detached immediately
    if (!isTui) {
      try {
        const child = spawn('cmd.exe', ['/c', 'start', '""', editor, filePath], {
          cwd: fileDir,
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
        })
        child.unref()
        return { ok: true, editor, filePath, mode: 'external' }
      } catch (err: any) {
        return { ok: false, editor, filePath, mode: 'external', error: err?.message }
      }
    }

    // 3b. If it's a TUI editor (nvim/vim) and Windows Terminal (wt) is available,
    // open in a new tab of the existing window seamlessly without breaking stdout pipe!
    if (isWindowsTerminalAvailable()) {
      try {
        const child = spawn(
          'wt.exe',
          ['-w', '0', 'new-tab', '-d', fileDir, '--title', 'banyan-config', editor, filePath],
          {
            detached: true,
            stdio: 'ignore',
            windowsHide: false,
          },
        )
        child.unref()
        return { ok: true, editor, filePath, mode: 'tab' }
      } catch {
        // Fallback to cmd start below
      }
    }

    // 3c. Fallback for TUI editor on Windows: launch in its own console window via cmd.exe start
    try {
      const child = spawn('cmd.exe', ['/c', 'start', 'banyan-config', editor, filePath], {
        cwd: fileDir,
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      })
      child.unref()
      return { ok: true, editor, filePath, mode: 'tab' }
    } catch (err: any) {
      return { ok: false, editor, filePath, mode: 'inline', error: err?.message }
    }
  }

  // 4. Linux / macOS inline execution
  const wasRaw = Boolean(process.stdin.isTTY && (process.stdin as any).isRaw)
  try {
    if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
      process.stdin.setRawMode(false)
    }
    if (typeof process.stdin.pause === 'function') {
      process.stdin.pause()
    }
    if (process.stderr.isTTY) {
      process.stderr.write('\x1b[?1049l\x1b[?25h')
    }

    const res = spawnSync(editor, [filePath], {
      cwd: fileDir,
      stdio: 'inherit',
      shell: false,
    })

    if (res.error) {
      return { ok: false, editor, filePath, mode: 'inline', error: res.error.message }
    }
    return { ok: true, editor, filePath, mode: 'inline' }
  } catch (err: any) {
    return {
      ok: false,
      editor,
      filePath,
      mode: 'inline',
      error: err?.message || 'Failed to open editor',
    }
  } finally {
    if (process.stderr.isTTY) {
      process.stderr.write('\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l')
    }
    if (typeof process.stdin.resume === 'function') {
      process.stdin.resume()
    }
    if (wasRaw && process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
      process.stdin.setRawMode(true)
    }
  }
}
