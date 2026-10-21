import { spawn } from 'node:child_process'

/**
 * Copies a string to the system clipboard across Windows, macOS, and Linux.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    let command: string
    let args: string[] = []

    if (process.platform === 'win32') {
      command = 'clip'
      args = []
    } else if (process.platform === 'darwin') {
      command = 'pbcopy'
      args = []
    } else {
      // Linux: Try wl-copy first if Wayland session, otherwise xclip or xsel
      if (process.env.WAYLAND_DISPLAY) {
        command = 'wl-copy'
      } else {
        command = 'xclip'
        args = ['-selection', 'clipboard']
      }
    }

    try {
      const child = spawn(command, args, { stdio: ['pipe', 'ignore', 'ignore'] })
      child.on('error', () => resolve(false))
      child.on('close', (code) => resolve(code === 0))

      child.stdin.write(text)
      child.stdin.end()
    } catch {
      resolve(false)
    }
  })
}
