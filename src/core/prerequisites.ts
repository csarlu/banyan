import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { getMuxBinaryName } from '../integrations/mux.js'

const execFileAsync = promisify(execFile)

export const MIN_NODE_MAJOR = 20

export type PrerequisiteId = 'git' | 'node' | 'mux' | 'clipboard'

export interface PrerequisiteCheck {
  id: PrerequisiteId
  label: string
  required: boolean
  ok: boolean
  version?: string
  /** Command(s) the user can run to install the missing tool on this platform. */
  installHint?: string
}

async function probeVersion(bin: string, args: string[]): Promise<string | null> {
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, { windowsHide: true, timeout: 5000 })
    const firstLine = (stdout || stderr).split(/\r?\n/)[0]?.trim()
    return firstLine || bin
  } catch {
    return null
  }
}

export function gitInstallHint(platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32')
    return 'winget install --id Git.Git -e   /   https://git-scm.com/download/win'
  if (platform === 'darwin') return 'brew install git   /   xcode-select --install'
  return 'sudo apt install git   /   sudo dnf install git   /   sudo pacman -S git'
}

export function muxInstallHint(platform: NodeJS.Platform): string {
  if (platform === 'win32') return 'winget install --id marlocarlo.psmux -e'
  if (platform === 'darwin') return 'brew install tmux'
  return 'sudo apt install tmux   /   sudo dnf install tmux'
}

function clipboardCandidate(platform: NodeJS.Platform): { bin: string; hint?: string } {
  if (platform === 'win32') return { bin: 'clip' }
  if (platform === 'darwin') return { bin: 'pbcopy' }
  if (process.env.WAYLAND_DISPLAY) return { bin: 'wl-copy', hint: 'sudo apt install wl-clipboard' }
  return { bin: 'xclip', hint: 'sudo apt install xclip' }
}

async function commandExists(bin: string, platform: NodeJS.Platform): Promise<boolean> {
  try {
    await execFileAsync(platform === 'win32' ? 'where' : 'which', [bin], { windowsHide: true })
    return true
  } catch {
    return false
  }
}

export async function checkGit(): Promise<PrerequisiteCheck> {
  const version = await probeVersion('git', ['--version'])
  return {
    id: 'git',
    label: 'git',
    required: true,
    ok: version !== null,
    version: version ?? undefined,
    installHint: version ? undefined : gitInstallHint(),
  }
}

export function checkNode(nodeVersion: string = process.versions.node): PrerequisiteCheck {
  const major = Number.parseInt(nodeVersion.split('.')[0], 10)
  const ok = major >= MIN_NODE_MAJOR
  return {
    id: 'node',
    label: `Node.js >= ${MIN_NODE_MAJOR}`,
    required: true,
    ok,
    version: `v${nodeVersion}`,
    installHint: ok ? undefined : 'https://nodejs.org/   /   nvm / fnm / volta',
  }
}

export async function checkPrerequisites(
  platform: NodeJS.Platform = process.platform,
): Promise<PrerequisiteCheck[]> {
  const muxBin = getMuxBinaryName()
  const clip = clipboardCandidate(platform)

  const [git, muxVersion, clipOk] = await Promise.all([
    checkGit(),
    probeVersion(muxBin, [muxBin === 'tmux' ? '-V' : '--version']),
    commandExists(clip.bin, platform),
  ])

  return [
    git,
    checkNode(),
    {
      id: 'mux',
      label: muxBin,
      required: false,
      ok: muxVersion !== null,
      version: muxVersion ?? undefined,
      installHint: muxVersion ? undefined : muxInstallHint(platform),
    },
    {
      id: 'clipboard',
      label: clip.bin,
      required: false,
      ok: clipOk,
      installHint: clipOk ? undefined : clip.hint,
    },
  ]
}
