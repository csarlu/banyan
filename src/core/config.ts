import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { z } from 'zod'
import { BanyanConfig, WorkspaceConfig } from './types.js'

const RepoConfigSchema = z.object({
  alias: z.string(),
  path: z.string(),
})

const ThemeEnum = z.enum([
  'default',
  'catppuccin',
  'dracula',
  'nord',
  'monokai',
  'solarized',
  'matrix',
])

const LocaleEnum = z.enum(['es', 'en'])

const WorkspaceConfigSchema = z.object({
  root: z.string(),
  discoverSubdirs: z.boolean().optional().default(true),
  theme: ThemeEnum.optional(),
  lang: LocaleEnum.optional(),
  repos: z.array(RepoConfigSchema).default([]),
  adapters: z
    .object({
      node: z
        .object({
          enabled: z.union([z.literal('auto'), z.boolean()]).default('auto'),
          highlightScopes: z.array(z.string()).default([]),
        })
        .optional(),
      python: z
        .object({
          enabled: z.union([z.literal('auto'), z.boolean()]).default('auto'),
        })
        .optional(),
      go: z
        .object({
          enabled: z.union([z.literal('auto'), z.boolean()]).default('auto'),
        })
        .optional(),
      rust: z
        .object({
          enabled: z.union([z.literal('auto'), z.boolean()]).default('auto'),
        })
        .optional(),
      dotnet: z
        .object({
          enabled: z.union([z.literal('auto'), z.boolean()]).default('auto'),
        })
        .optional(),
      raw: z
        .object({
          enabled: z.union([z.literal('auto'), z.boolean()]).default('auto'),
        })
        .optional(),
    })
    .optional(),
  agentDetection: z
    .object({
      lockFiles: z.array(z.string()).default(['.aider*', '.claude*', '.cursor*']),
      recentModifiedThresholdSec: z.number().default(45),
    })
    .optional(),
})

const BanyanConfigSchema = z.object({
  $schema: z.string().optional(),
  defaultWorkspace: z.string(),
  theme: ThemeEnum.optional(),
  lang: LocaleEnum.optional(),
  workspaces: z.record(z.string(), WorkspaceConfigSchema),
})

export function expandTilde(filePath: string): string {
  if (filePath.startsWith('~/') || filePath === '~') {
    return path.join(os.homedir(), filePath.slice(1))
  }
  return filePath
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function detectPackageJsonScope(cwd: string): Promise<string[]> {
  try {
    const pkgPath = path.join(cwd, 'package.json')
    if (await fileExists(pkgPath)) {
      const raw = await fs.readFile(pkgPath, 'utf-8')
      const parsed = JSON.parse(raw)
      if (
        typeof parsed?.name === 'string' &&
        parsed.name.startsWith('@') &&
        parsed.name.includes('/')
      ) {
        return [parsed.name.split('/')[0]]
      }
    }
  } catch {
    // Ignore errors reading package.json
  }
  return []
}

export async function loadConfig(
  cwd: string = process.cwd(),
  workspaceOverride?: string,
): Promise<{
  workspaceName: string
  workspace: WorkspaceConfig
  configPath?: string
  rawConfig?: BanyanConfig
}> {
  const candidates = [
    path.join(cwd, 'banyan.config.json'),
    path.join(cwd, '.banyanrc.json'),
    path.join(os.homedir(), '.config', 'banyan', 'banyan.config.json'),
    path.join(os.homedir(), '.banyanrc.json'),
  ]

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      const raw = await fs.readFile(candidate, 'utf-8')
      const parsed = BanyanConfigSchema.parse(JSON.parse(raw)) as BanyanConfig
      const wsName = workspaceOverride || parsed.defaultWorkspace
      const ws = parsed.workspaces[wsName]
      if (!ws) {
        throw new Error(`Workspace "${wsName}" no encontrado en ${candidate}`)
      }
      return {
        workspaceName: wsName,
        workspace: await normalizeWorkspace(ws, path.dirname(candidate)),
        configPath: candidate,
        rawConfig: parsed,
      }
    }
  }

  const detectedScopes = await detectPackageJsonScope(cwd)

  const autoWorkspace: WorkspaceConfig = {
    root: cwd,
    discoverSubdirs: true,
    repos: [],
    adapters: {
      node: {
        enabled: 'auto',
        highlightScopes: detectedScopes,
      },
    },
    agentDetection: {
      lockFiles: ['.aider*', '.claude*', '.cursor*'],
      recentModifiedThresholdSec: 45,
    },
  }

  return {
    workspaceName: path.basename(cwd) || 'auto-workspace',
    workspace: await normalizeWorkspace(autoWorkspace, cwd),
  }
}

async function normalizeWorkspace(ws: WorkspaceConfig, baseDir: string): Promise<WorkspaceConfig> {
  const resolvedRoot = path.resolve(baseDir, expandTilde(ws.root))
  const reposMap = new Map<string, string>()

  for (const r of ws.repos) {
    const fullPath = path.resolve(resolvedRoot, expandTilde(r.path))
    reposMap.set(fullPath, r.alias)
  }

  if (await fileExists(path.join(resolvedRoot, '.git'))) {
    if (!reposMap.has(resolvedRoot)) {
      reposMap.set(resolvedRoot, path.basename(resolvedRoot))
    }
  }

  if (ws.discoverSubdirs) {
    try {
      const entries = await fs.readdir(resolvedRoot, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          const subPath = path.join(resolvedRoot, entry.name)
          if (await fileExists(path.join(subPath, '.git'))) {
            if (!reposMap.has(subPath)) {
              reposMap.set(subPath, entry.name)
            }
          }
        }
      }
    } catch {
      // Ignorar errores de permisos
    }
  }

  return {
    ...ws,
    root: resolvedRoot,
    repos: Array.from(reposMap.entries()).map(([p, alias]) => ({ alias, path: p })),
  }
}
