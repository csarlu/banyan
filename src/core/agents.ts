import fs from 'node:fs/promises'
import path from 'node:path'
import { AgentStatus, WorkspaceConfig } from './types.js'
import { getMuxBinaryName } from '../integrations/mux.js'

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

export async function detectAgentActivity(
  worktreePath: string,
  dirtyFilesRelative: string[],
  workspaceConfig: WorkspaceConfig,
  activeMuxPaths: Set<string>,
): Promise<AgentStatus> {
  const thresholdSec = workspaceConfig.agentDetection?.recentModifiedThresholdSec ?? 45
  const now = Date.now()

  // 1. Verificar bloqueo activo de Git (.git/index.lock)
  const dotGitPath = path.join(worktreePath, '.git')
  try {
    const stat = await fs.lstat(dotGitPath)
    if (stat.isDirectory()) {
      if (await exists(path.join(dotGitPath, 'index.lock'))) {
        return { isActive: true, reason: 'git-lock', detail: 'index.lock activo' }
      }
    } else if (stat.isFile()) {
      const content = await fs.readFile(dotGitPath, 'utf-8')
      const match = content.match(/^gitdir:\s*(.+)$/m)
      if (match) {
        const gitDir = path.resolve(worktreePath, match[1].trim())
        if (await exists(path.join(gitDir, 'index.lock'))) {
          return { isActive: true, reason: 'git-lock', detail: 'worktree index.lock activo' }
        }
      }
    }
  } catch {
    // Ignorar
  }

  // 2. Verificar archivos de lock o estado de agentes conocidos (.aider*, .claude*, etc.)
  try {
    const entries = await fs.readdir(worktreePath)
    const agentMarker = entries.find(
      (name) =>
        name.startsWith('.aider') ||
        name.startsWith('.claude') ||
        name === '.cursor.lock' ||
        name === '.agent.lock',
    )
    if (agentMarker) {
      const markerStat = await fs.stat(path.join(worktreePath, agentMarker))
      const ageSec = (now - markerStat.mtimeMs) / 1000
      if (ageSec <= thresholdSec * 4) {
        return {
          isActive: true,
          reason: 'lockfile',
          detail: agentMarker,
          lastModifiedMs: markerStat.mtimeMs,
        }
      }
    }
  } catch {
    // Ignorar
  }

  // 3. Verificar Heartbeat del sistema de archivos en archivos modificados recientemente
  let mostRecentMtime = 0
  for (const relFile of dirtyFilesRelative.slice(0, 25)) {
    try {
      const fullPath = path.join(worktreePath, relFile)
      const st = await fs.stat(fullPath)
      if (st.mtimeMs > mostRecentMtime) {
        mostRecentMtime = st.mtimeMs
      }
    } catch {
      // El archivo puede haber sido borrado
    }
  }

  if (mostRecentMtime > 0 && (now - mostRecentMtime) / 1000 <= thresholdSec) {
    return {
      isActive: true,
      reason: 'fs-heartbeat',
      detail: `Modificado hace ${Math.round((now - mostRecentMtime) / 1000)}s`,
      lastModifiedMs: mostRecentMtime,
    }
  }

  // 4. Verificar si hay una sesión de tmux/psmux activa apuntando a este directorio
  const normalizedWt = path.resolve(worktreePath).toLowerCase()
  const muxBin = getMuxBinaryName()
  for (const muxPath of activeMuxPaths) {
    if (path.resolve(muxPath).toLowerCase() === normalizedWt) {
      return {
        isActive: true,
        reason: 'mux-session',
        detail: `Panel ${muxBin} abierto`,
      }
    }
  }

  return {
    isActive: false,
    lastModifiedMs: mostRecentMtime > 0 ? mostRecentMtime : undefined,
  }
}
