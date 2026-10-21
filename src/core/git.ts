import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import { NodeModulesType, RepoConfig, WorkspaceConfig, WorktreeNode } from './types.js'
import { detectAgentActivity } from './agents.js'
import { enrichWorktreesWithEcosystems } from './adapters/index.js'

const execFileAsync = promisify(execFile)

interface RawWorktreeEntry {
  worktreePath: string
  headSha: string
  branch: string
  isBare: boolean
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 5,
    })
    return stdout
  } catch {
    return ''
  }
}

export function parseWorktreePorcelain(output: string): RawWorktreeEntry[] {
  const entries: RawWorktreeEntry[] = []
  const blocks = output.trim().split(/\r?\n\r?\n/)

  for (const block of blocks) {
    if (!block.trim()) continue
    const lines = block.split(/\r?\n/)
    let worktreePath = ''
    let headSha = ''
    let branch = 'detached'
    let isBare = false

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        worktreePath = path.resolve(line.slice('worktree '.length).trim())
      } else if (line.startsWith('HEAD ')) {
        headSha = line.slice('HEAD '.length).trim().slice(0, 7)
      } else if (line.startsWith('branch ')) {
        const ref = line.slice('branch '.length).trim()
        branch = ref.replace(/^refs\/heads\//, '')
      } else if (line === 'bare') {
        isBare = true
      } else if (line === 'detached') {
        branch = 'detached'
      }
    }

    if (worktreePath) {
      entries.push({ worktreePath, headSha, branch, isBare })
    }
  }

  return entries
}

export function parseStatusPorcelainV2(output: string): {
  ahead: number
  behind: number
  dirtyCount: number
  dirtyFiles: string[]
} {
  let ahead = 0
  let behind = 0
  let dirtyCount = 0
  const dirtyFiles: string[] = []

  const lines = output.split(/\r?\n/)
  for (const line of lines) {
    if (!line) continue
    if (line.startsWith('# branch.ab ')) {
      const match = line.match(/\+(\d+)\s+-(\d+)/)
      if (match) {
        ahead = parseInt(match[1], 10)
        behind = parseInt(match[2], 10)
      }
    } else if (
      line.startsWith('1 ') ||
      line.startsWith('2 ') ||
      line.startsWith('u ') ||
      line.startsWith('? ')
    ) {
      dirtyCount++
      const parts = line.split(' ')
      const filePath = parts[parts.length - 1]
      if (filePath) {
        dirtyFiles.push(filePath)
      }
    }
  }

  return { ahead, behind, dirtyCount, dirtyFiles }
}

async function inspectRootNodeModules(worktreePath: string): Promise<{
  nodeModulesType: NodeModulesType
  sharedNodeModulesTarget?: string
}> {
  const nmPath = path.join(worktreePath, 'node_modules')
  try {
    const st = await fs.lstat(nmPath)
    if (st.isSymbolicLink()) {
      const target = await fs.realpath(nmPath)
      return {
        nodeModulesType: 'shared',
        sharedNodeModulesTarget: target,
      }
    }
    return { nodeModulesType: 'own' }
  } catch {
    return { nodeModulesType: 'none' }
  }
}

export async function fetchRecentCommitsGraph(
  worktreePath: string,
  maxCount: number = 8,
): Promise<string[]> {
  const gitOut = await runGit(worktreePath, [
    'log',
    '--oneline',
    '--graph',
    '--decorate',
    '--no-color',
    '-n',
    String(maxCount),
  ])

  return gitOut
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter(Boolean)
}

const commitCache = new Map<string, string[]>()

async function inspectSingleWorktree(
  repo: RepoConfig,
  raw: RawWorktreeEntry,
  workspaceConfig: WorkspaceConfig,
  activeMuxPaths: Set<string>,
): Promise<WorktreeNode> {
  // FIX 1: Unicidad garantizada usando ruta relativa respecto a workspaceConfig.root
  const rawRelPath = path.relative(workspaceConfig.root, raw.worktreePath).replace(/\\/g, '/')
  const relPath = rawRelPath || path.basename(raw.worktreePath)
  const id = `${repo.alias}:${relPath}`

  if (raw.isBare) {
    return {
      id,
      relPath,
      repoAlias: repo.alias,
      repoPath: repo.path,
      worktreePath: raw.worktreePath,
      branch: '(bare)',
      headSha: raw.headSha,
      isBare: true,
      dirtyCount: 0,
      ahead: 0,
      behind: 0,
      recentCommits: [],
      nodeModulesType: 'none',
      agentStatus: { isActive: false },
    }
  }

  const cacheKey = `${raw.worktreePath}:${raw.headSha}:${raw.branch}`
  let logPromise: Promise<string[]>
  if (raw.headSha && commitCache.has(cacheKey)) {
    logPromise = Promise.resolve(commitCache.get(cacheKey)!)
  } else {
    logPromise = fetchRecentCommitsGraph(raw.worktreePath, 8).then((commits) => {
      if (raw.headSha) {
        if (commitCache.size > 200) commitCache.clear()
        commitCache.set(cacheKey, commits)
      }
      return commits
    })
  }

  const [statusOut, recentCommits, nmInfo] = await Promise.all([
    runGit(raw.worktreePath, ['status', '--porcelain=v2', '--branch']),
    logPromise,
    inspectRootNodeModules(raw.worktreePath),
  ])

  const { ahead, behind, dirtyCount, dirtyFiles } = parseStatusPorcelainV2(statusOut)

  const agentStatus = await detectAgentActivity(
    raw.worktreePath,
    dirtyFiles,
    workspaceConfig,
    activeMuxPaths,
  )

  return {
    id,
    relPath,
    repoAlias: repo.alias,
    repoPath: repo.path,
    worktreePath: raw.worktreePath,
    branch: raw.branch,
    headSha: raw.headSha,
    isBare: false,
    dirtyCount,
    ahead,
    behind,
    recentCommits,
    nodeModulesType: nmInfo.nodeModulesType,
    sharedNodeModulesTarget: nmInfo.sharedNodeModulesTarget,
    agentStatus,
  }
}

export async function scanAllWorktrees(
  workspaceConfig: WorkspaceConfig,
  activeMuxPaths: Set<string> = new Set(),
): Promise<WorktreeNode[]> {
  const repoPromises = workspaceConfig.repos.map(async (repo) => {
    const porcelainOut = await runGit(repo.path, ['worktree', 'list', '--porcelain'])
    const rawEntries = parseWorktreePorcelain(porcelainOut)

    const wtResults = await Promise.allSettled(
      rawEntries.map((raw) => inspectSingleWorktree(repo, raw, workspaceConfig, activeMuxPaths)),
    )

    const nodes: WorktreeNode[] = []
    for (const res of wtResults) {
      if (res.status === 'fulfilled') {
        nodes.push(res.value)
      }
    }
    return nodes
  })

  const nested = await Promise.all(repoPromises)
  const seenPaths = new Set<string>()
  const uniqueNodes: WorktreeNode[] = []

  for (const list of nested) {
    for (const node of list) {
      const norm = node.worktreePath.toLowerCase()
      if (!seenPaths.has(norm)) {
        seenPaths.add(norm)
        uniqueNodes.push(node)
      }
    }
  }

  // Vincular sharedNodeModulesWorktreeId si la carpeta node_modules compartida pertenece a otro worktree conocido
  const sortedByLen = [...uniqueNodes].sort((a, b) => b.worktreePath.length - a.worktreePath.length)
  for (const node of uniqueNodes) {
    if (node.nodeModulesType === 'shared' && node.sharedNodeModulesTarget) {
      const normTarget = path.resolve(node.sharedNodeModulesTarget).toLowerCase()
      const ownerWt = sortedByLen.find((wt) => {
        const normWt = path.resolve(wt.worktreePath).toLowerCase()
        return normTarget === normWt || normTarget.startsWith(normWt + path.sep)
      })
      if (ownerWt) {
        node.sharedNodeModulesWorktreeId = ownerWt.id
      }
    }
  }

  await enrichWorktreesWithEcosystems(uniqueNodes)

  return uniqueNodes
}

export async function removeWorktree(
  repoPath: string,
  worktreePath: string,
  force = false,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const args = ['worktree', 'remove', worktreePath]
    if (force) args.push('--force')
    await execFileAsync('git', args, { cwd: repoPath, windowsHide: true })
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.stderr || err?.message || 'Error eliminando worktree' }
  }
}
