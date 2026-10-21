import { describe, it, expect, vi, afterEach } from 'vitest'
import { handleMcpRequest, MCP_TOOLS } from '../src/core/mcpServer.js'
import * as orchestrator from '../src/core/orchestrator.js'
import * as fixRunner from '../src/core/fixRunner.js'

describe('Banyan MCP Server Mode (BAN-7)', () => {
  const baseCwd = process.cwd()

  it('exposes the 3 required MCP tools', () => {
    expect(MCP_TOOLS.map((t) => t.name)).toEqual([
      'banyan_get_worktree_context',
      'banyan_list_collisions',
      'banyan_apply_fix',
    ])
  })

  it('handles "initialize" request according to MCP specification', async () => {
    const res = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05' },
      },
      baseCwd,
    )

    expect(res).not.toBeNull()
    expect(res?.id).toBe(1)
    expect(res?.result?.serverInfo?.name).toBe('banyan-mcp-server')
    expect(res?.result?.capabilities?.tools).toBeDefined()
  })

  it('handles "tools/list" request and returns all tools', async () => {
    const res = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      },
      baseCwd,
    )

    expect(res?.result?.tools).toHaveLength(3)
    expect(res?.result?.tools.some((t: any) => t.name === 'banyan_get_worktree_context')).toBe(true)
  })

  it('handles "tools/call" for banyan_get_worktree_context', async () => {
    const res = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'banyan_get_worktree_context',
          arguments: { cwd: baseCwd },
        },
      },
      baseCwd,
    )

    expect(res?.result?.content).toBeDefined()
    expect(res?.result?.content[0]?.type).toBe('text')
    expect(res?.result?.content[0]?.text).toContain('BANYAN AGENT SITUATIONAL AWARENESS')
  })

  it('handles "tools/call" for banyan_list_collisions', async () => {
    const res = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'banyan_list_collisions',
        },
      },
      baseCwd,
    )

    expect(res?.result?.content).toBeDefined()
    const data = JSON.parse(res?.result?.content[0]?.text)
    expect(data.workspace).toBeDefined()
    expect(Array.isArray(data.warnings)).toBe(true)
  })

  it('returns clean error for nonexistent warning in banyan_apply_fix', async () => {
    const res = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'banyan_apply_fix',
          arguments: { warningId: 'non-existent-warn-999' },
        },
      },
      baseCwd,
    )

    expect(res?.result?.isError).toBe(true)
    expect(res?.result?.content[0]?.text).toContain('not found')
  })

  describe('banyan_apply_fix security opt-in and dry-run (BAN-21)', () => {
    const originalEnv = { ...process.env }
    afterEach(() => {
      process.env = { ...originalEnv }
      vi.restoreAllMocks()
    })

    const mockSnapshotWithWarning = (hasFixCommand = true) => {
      const mockSnapshot = {
        workspaceName: 'test-ws',
        worktrees: [
          {
            id: 'wt-auth',
            repoName: 'auth-svc',
            worktreePath: 'C:\\fake\\path\\auth-svc',
            branch: 'feat-login',
            isClean: true,
            activeAgents: [],
            manifestDependencies: [],
            inboundLinks: [],
            outboundLinks: [],
          },
        ],
        dependencyGraph: [],
        warnings: [
          {
            id: 'warn-sec-1',
            type: 'BRANCH_MISMATCH' as const,
            severity: 'warning' as const,
            message: 'Branch mismatch detected',
            affectedWorktreeIds: ['wt-auth'],
            suggestedFixCommand: hasFixCommand ? 'npm install @acme/core@1.2.0' : undefined,
          },
        ],
        timestamp: new Date().toISOString(),
      }
      vi.spyOn(orchestrator, 'buildEcosystemSnapshot').mockResolvedValue(mockSnapshot as any)
      return mockSnapshot
    }

    it('defaults to dry-run mode without running command when opt-in is absent', async () => {
      mockSnapshotWithWarning(true)
      const executeSpy = vi.spyOn(fixRunner, 'executeFixCommand')

      delete process.env.BANYAN_MCP_ALLOW_FIX
      const res = await handleMcpRequest(
        {
          jsonrpc: '2.0',
          id: 10,
          method: 'tools/call',
          params: {
            name: 'banyan_apply_fix',
            arguments: { warningId: 'warn-sec-1' },
          },
        },
        baseCwd,
      )

      expect(executeSpy).not.toHaveBeenCalled()
      expect(res?.result?.isError).toBe(false)
      expect(res?.result?.content[0]?.text).toContain('[DRY-RUN]')
      expect(res?.result?.content[0]?.text).toContain('npm install @acme/core@1.2.0')
    })

    it('executes fix command when options.allowFix is true', async () => {
      mockSnapshotWithWarning(true)
      const executeSpy = vi.spyOn(fixRunner, 'executeFixCommand').mockResolvedValue({
        ok: true,
        command: 'npm install @acme/core@1.2.0',
        stdout: 'installed 1 package',
      })

      const res = await handleMcpRequest(
        {
          jsonrpc: '2.0',
          id: 11,
          method: 'tools/call',
          params: {
            name: 'banyan_apply_fix',
            arguments: { warningId: 'warn-sec-1' },
          },
        },
        baseCwd,
        { allowFix: true },
      )

      expect(executeSpy).toHaveBeenCalledWith(
        'npm install @acme/core@1.2.0',
        'C:\\fake\\path\\auth-svc',
      )
      expect(res?.result?.isError).toBe(false)
      expect(res?.result?.content[0]?.text).toContain('Auto-fix applied successfully')
    })

    it('executes fix command when BANYAN_MCP_ALLOW_FIX=1', async () => {
      mockSnapshotWithWarning(true)
      const executeSpy = vi.spyOn(fixRunner, 'executeFixCommand').mockResolvedValue({
        ok: true,
        command: 'npm install @acme/core@1.2.0',
        stdout: 'installed 1 package',
      })

      process.env.BANYAN_MCP_ALLOW_FIX = '1'
      const res = await handleMcpRequest(
        {
          jsonrpc: '2.0',
          id: 12,
          method: 'tools/call',
          params: {
            name: 'banyan_apply_fix',
            arguments: { warningId: 'warn-sec-1' },
          },
        },
        baseCwd,
      )

      expect(executeSpy).toHaveBeenCalledTimes(1)
      expect(res?.result?.isError).toBe(false)
      expect(res?.result?.content[0]?.text).toContain('Auto-fix applied successfully')
    })

    it('respects dryRun: true even when allowFix is enabled', async () => {
      mockSnapshotWithWarning(true)
      const executeSpy = vi.spyOn(fixRunner, 'executeFixCommand')

      const res = await handleMcpRequest(
        {
          jsonrpc: '2.0',
          id: 13,
          method: 'tools/call',
          params: {
            name: 'banyan_apply_fix',
            arguments: { warningId: 'warn-sec-1', dryRun: true },
          },
        },
        baseCwd,
        { allowFix: true },
      )

      expect(executeSpy).not.toHaveBeenCalled()
      expect(res?.result?.isError).toBe(false)
      expect(res?.result?.content[0]?.text).toContain('[DRY-RUN]')
    })

    it('returns error when warning has no suggestedFixCommand', async () => {
      mockSnapshotWithWarning(false)
      const res = await handleMcpRequest(
        {
          jsonrpc: '2.0',
          id: 14,
          method: 'tools/call',
          params: {
            name: 'banyan_apply_fix',
            arguments: { warningId: 'warn-sec-1' },
          },
        },
        baseCwd,
        { allowFix: true },
      )

      expect(res?.result?.isError).toBe(true)
      expect(res?.result?.content[0]?.text).toContain('does not have an automated fix command')
    })
  })

  it('returns -32601 for unknown method', async () => {
    const res = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 6,
        method: 'non_existent_method',
      },
      baseCwd,
    )

    expect(res?.error?.code).toBe(-32601)
  })
})
