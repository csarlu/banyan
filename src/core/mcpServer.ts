import readline from 'node:readline'
import { loadConfig } from './config.js'
import { buildEcosystemSnapshot } from './orchestrator.js'
import { generateAgentBriefing } from './agentBriefing.js'
import { executeFixCommand } from './fixRunner.js'

export interface McpServerOptions {
  allowFix?: boolean
}

export const MCP_TOOLS = [
  {
    name: 'banyan_get_worktree_context',
    description:
      'Returns the situational briefing, active branch, and blast radius for a given worktree directory.',
    inputSchema: {
      type: 'object',
      properties: {
        cwd: {
          type: 'string',
          description: 'Target worktree directory path (defaults to current working directory)',
        },
      },
    },
  },
  {
    name: 'banyan_list_collisions',
    description:
      'Returns all active cross-worktree collision warnings, dirty locks, and suggested fix commands.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'banyan_apply_fix',
    description:
      'Returns or executes a suggested auto-fix command for an active collision warning ID. Requires explicit opt-in (--allow-fix flag or BANYAN_MCP_ALLOW_FIX=1 env var) to execute; otherwise returns the command safely in dry-run mode without running it.',
    inputSchema: {
      type: 'object',
      properties: {
        warningId: {
          type: 'string',
          description: 'The ID of the collision warning to fix',
        },
        dryRun: {
          type: 'boolean',
          description:
            'If true, returns the suggested command without executing it, even if server opt-in is enabled',
        },
      },
      required: ['warningId'],
    },
  },
]

export interface JsonRpcRequest {
  jsonrpc: string
  id?: string | number | null
  method: string
  params?: any
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id?: string | number | null
  result?: any
  error?: {
    code: number
    message: string
    data?: any
  }
}

/**
 * Dispatches an incoming MCP JSON-RPC 2.0 request and returns the response.
 */
export async function handleMcpRequest(
  req: JsonRpcRequest,
  baseCwd: string = process.cwd(),
  options: McpServerOptions = {},
): Promise<JsonRpcResponse | null> {
  const { id, method, params } = req

  // 1. Lifecycle initialization
  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id: id ?? null,
      result: {
        protocolVersion: '2024-11-05',
        serverInfo: {
          name: 'banyan-mcp-server',
          version: '1.0.0',
        },
        capabilities: {
          tools: {},
        },
      },
    }
  }

  // 2. Initialized notification from client (no response required)
  if (method === 'notifications/initialized' || method === 'initialized') {
    return null
  }

  // 3. Ping
  if (method === 'ping') {
    return {
      jsonrpc: '2.0',
      id: id ?? null,
      result: {},
    }
  }

  // 4. Tools list
  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id: id ?? null,
      result: {
        tools: MCP_TOOLS,
      },
    }
  }

  // 5. Tools call
  if (method === 'tools/call') {
    const toolName = params?.name
    const toolArgs = params?.arguments || {}

    try {
      const { workspaceName, workspace } = await loadConfig(baseCwd)
      const snapshot = await buildEcosystemSnapshot(workspaceName, workspace)

      if (toolName === 'banyan_get_worktree_context') {
        const targetCwd = toolArgs.cwd || baseCwd
        const { markdownBriefing, exitCode } = generateAgentBriefing(snapshot, targetCwd)
        return {
          jsonrpc: '2.0',
          id: id ?? null,
          result: {
            content: [
              {
                type: 'text',
                text: markdownBriefing,
              },
            ],
            isError: exitCode !== 0,
          },
        }
      }

      if (toolName === 'banyan_list_collisions') {
        return {
          jsonrpc: '2.0',
          id: id ?? null,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    workspace: snapshot.workspaceName,
                    collisionCount: snapshot.warnings.length,
                    warnings: snapshot.warnings,
                  },
                  null,
                  2,
                ),
              },
            ],
          },
        }
      }

      if (toolName === 'banyan_apply_fix') {
        const warningId = toolArgs.warningId
        const warning = snapshot.warnings.find((w) => w.id === warningId)

        if (!warning) {
          return {
            jsonrpc: '2.0',
            id: id ?? null,
            result: {
              content: [
                {
                  type: 'text',
                  text: `Warning ID "${warningId}" not found among active collisions.`,
                },
              ],
              isError: true,
            },
          }
        }

        if (!warning.suggestedFixCommand) {
          return {
            jsonrpc: '2.0',
            id: id ?? null,
            result: {
              content: [
                {
                  type: 'text',
                  text: `Warning [${warning.type}] does not have an automated fix command.`,
                },
              ],
              isError: true,
            },
          }
        }

        const affectedWt = snapshot.worktrees.find((w) =>
          warning.affectedWorktreeIds.includes(w.id),
        )
        const fixCwd = affectedWt?.worktreePath || baseCwd

        const isOptedIn = Boolean(
          options.allowFix ||
          process.env.BANYAN_MCP_ALLOW_FIX === '1' ||
          process.env.BANYAN_MCP_ALLOW_FIX === 'true',
        )
        const isDryRun = Boolean(toolArgs.dryRun || !isOptedIn)

        if (isDryRun) {
          const reason = toolArgs.dryRun
            ? 'dry-run requested'
            : 'MCP auto-fix execution is disabled by default for security. Pass --allow-fix or set BANYAN_MCP_ALLOW_FIX=1 to execute commands.'
          return {
            jsonrpc: '2.0',
            id: id ?? null,
            result: {
              content: [
                {
                  type: 'text',
                  text: `[DRY-RUN] Command not executed (${reason}).\n\nTarget Directory: ${fixCwd}\nSuggested Command:\n${warning.suggestedFixCommand}`,
                },
              ],
              isError: false,
            },
          }
        }

        const res = await executeFixCommand(warning.suggestedFixCommand, fixCwd)

        return {
          jsonrpc: '2.0',
          id: id ?? null,
          result: {
            content: [
              {
                type: 'text',
                text: res.ok
                  ? `✔ Auto-fix applied successfully:\n${res.stdout || warning.suggestedFixCommand}`
                  : `❌ Auto-fix failed:\n${res.error || res.stderr}`,
              },
            ],
            isError: !res.ok,
          },
        }
      }

      return {
        jsonrpc: '2.0',
        id: id ?? null,
        error: {
          code: -32601,
          message: `Unknown tool: "${toolName}"`,
        },
      }
    } catch (err: any) {
      return {
        jsonrpc: '2.0',
        id: id ?? null,
        error: {
          code: -32603,
          message: `Internal tool execution error: ${err?.message || err}`,
        },
      }
    }
  }

  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: {
      code: -32601,
      message: `Method not found: "${method}"`,
    },
  }
}

/**
 * Starts a stdio MCP server over stdin/stdout using NDJSON framing.
 */
export async function startMcpServer(
  baseCwd: string = process.cwd(),
  options: McpServerOptions = {},
): Promise<void> {
  const isOptedIn = Boolean(
    options.allowFix ||
    process.env.BANYAN_MCP_ALLOW_FIX === '1' ||
    process.env.BANYAN_MCP_ALLOW_FIX === 'true',
  )
  const allowMsg = isOptedIn
    ? ' (auto-fix execution ENABLED)'
    : ' (auto-fix dry-run only; opt-in with --allow-fix or BANYAN_MCP_ALLOW_FIX=1)'
  process.stderr.write(`🚀 Banyan MCP Server running on stdio (JSON-RPC 2.0)${allowMsg}...\n`)

  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false,
  })

  rl.on('line', async (line) => {
    const trimmed = line.trim()
    if (!trimmed) return

    try {
      const parsed = JSON.parse(trimmed) as JsonRpcRequest
      const res = await handleMcpRequest(parsed, baseCwd, options)
      if (res) {
        process.stdout.write(JSON.stringify(res) + '\n')
      }
    } catch (err: any) {
      const errResponse: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: `Parse error: ${err?.message}`,
        },
      }
      process.stdout.write(JSON.stringify(errResponse) + '\n')
    }
  })

  await new Promise<void>((resolve) => {
    rl.on('close', resolve)
  })
}
