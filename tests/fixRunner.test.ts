import { describe, it, expect } from 'vitest'
import { executeFixCommand } from '../src/core/fixRunner.js'
import { copyToClipboard } from '../src/core/clipboard.js'

describe('Auto-Fix Execution & Clipboard Yank (BAN-4)', () => {
  describe('executeFixCommand', () => {
    it('executes a safe echo command successfully', async () => {
      const isWindows = process.platform === 'win32'
      const cmd = isWindows ? 'Write-Output "banyan-autofix-ok"' : 'echo "banyan-autofix-ok"'
      const res = await executeFixCommand(cmd)

      expect(res.ok).toBe(true)
      expect(res.stdout).toContain('banyan-autofix-ok')
      expect(res.error).toBeUndefined()
    })

    it('captures failures cleanly for invalid commands', async () => {
      const res = await executeFixCommand('non_existent_command_xyz_123')
      expect(res.ok).toBe(false)
      expect(res.error).toBeDefined()
    })
  })

  describe('copyToClipboard', () => {
    it('attempts to copy without throwing an unhandled exception', async () => {
      // In CI / test environment where clip/pbcopy may or may not succeed, it must resolve cleanly to a boolean
      const result = await copyToClipboard('test clipboard content')
      expect(typeof result).toBe('boolean')
    })
  })
})
