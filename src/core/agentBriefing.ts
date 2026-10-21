import path from 'node:path'
import { EcosystemSnapshot, WorktreeNode } from './types.js'
import { Locale } from '../i18n/index.js'
import { getMessages, localizeWarningMessage } from '../i18n/messages.js'

export interface AgentContextResult {
  matchedWorktree: WorktreeNode | null
  markdownBriefing: string
  exitCode: 0 | 2 | 3
}

export function resolveCurrentWorktree(
  cwd: string,
  worktrees: WorktreeNode[],
): WorktreeNode | null {
  const normCwd = path.resolve(cwd).toLowerCase()
  const sorted = [...worktrees].sort((a, b) => b.worktreePath.length - a.worktreePath.length)
  return (
    sorted.find((wt) => {
      const normWt = path.resolve(wt.worktreePath).toLowerCase()
      const prefix = normWt.endsWith(path.sep) ? normWt : normWt + path.sep
      return normCwd === normWt || normCwd.startsWith(prefix)
    }) ?? null
  )
}

export function generateAgentBriefing(
  snapshot: EcosystemSnapshot,
  cwd: string = process.cwd(),
  locale: Locale = 'en',
): AgentContextResult {
  const bm = getMessages(locale).briefing
  const currentWt = resolveCurrentWorktree(cwd, snapshot.worktrees)
  const lines: string[] = []

  lines.push(`# 🤖 BANYAN AGENT SITUATIONAL AWARENESS`)
  lines.push(`- **Workspace:** \`${snapshot.workspaceName}\``)
  lines.push(`- **Multiplexer Backend:** \`${snapshot.muxBackend}\``)

  if (!currentWt) {
    lines.push(
      `- **Current Directory:** \`${cwd}\` (Outside specific worktree, showing global overview)`,
    )
    lines.push('')
    lines.push(`## 🌿 Active Worktrees (${snapshot.worktrees.length})`)
    for (const wt of snapshot.worktrees) {
      const agentTag = wt.agentStatus.isActive ? ` [🤖 ACTIVE AGENT: ${wt.agentStatus.reason}]` : ''
      lines.push(
        `- \`[${wt.id}]\` branch: \`${wt.branch}\` | dirty: ${wt.dirtyCount} | nm: \`${wt.nodeModulesType}\`${agentTag}`,
      )
    }
    const hasCrit = snapshot.warnings.some((w) => w.severity === 'critical')
    return {
      matchedWorktree: null,
      markdownBriefing: lines.join('\n') + '\n',
      exitCode: hasCrit ? 2 : 0,
    }
  }

  const outgoing = snapshot.junctions.filter((j) => j.sourceWorktreeId === currentWt.id)
  const incoming = snapshot.junctions.filter((j) => j.targetWorktreeId === currentWt.id)
  const myWarnings = snapshot.warnings.filter((w) => w.affectedWorktreeIds.includes(currentWt.id))
  const siblingWts = snapshot.worktrees.filter(
    (w) => w.repoAlias === currentWt.repoAlias && w.id !== currentWt.id,
  )

  lines.push('')
  lines.push(`## 🧭 Your Current Worktree Identity`)
  lines.push(`- **Worktree ID:** \`${currentWt.id}\``)
  lines.push(`- **Path:** \`${currentWt.worktreePath}\``)
  lines.push(`- **Branch:** \`${currentWt.branch}\` (\`${currentWt.headSha}\`)`)
  if (currentWt.detectedEcosystems && currentWt.detectedEcosystems.length > 0) {
    lines.push(`- **Detected Ecosystems:** \`${currentWt.detectedEcosystems.join(', ')}\``)
  }
  lines.push(
    `- **Git Status:** ${currentWt.dirtyCount} uncommitted file(s), ↑${currentWt.ahead} ↓${currentWt.behind}`,
  )
  lines.push(
    `- **Root node_modules:** \`${currentWt.nodeModulesType}\`${currentWt.sharedNodeModulesWorktreeId ? ` (linked to \`${currentWt.sharedNodeModulesWorktreeId}\`)` : ''}`,
  )

  lines.push('')
  lines.push(`## 🛡️ Mandatory Agent Guardrails (DO NOT VIOLATE)`)

  if (currentWt.nodeModulesType === 'shared') {
    lines.push(
      `- 🛑 **SHARED ROOT NODE_MODULES:** Your \`node_modules\` folder is a symlink/junction pointing to \`${currentWt.sharedNodeModulesWorktreeId || currentWt.sharedNodeModulesTarget}\`. **DO NOT** run \`npm install\`, \`npm ci\`, or mutate dependencies here, or you will corrupt the host worktree.`,
    )
  } else {
    lines.push(
      `- 📦 **Isolated Root node_modules:** Your root \`node_modules\` is \`${currentWt.nodeModulesType}\`.`,
    )
  }

  for (const env of currentWt.sharedEnvs ?? []) {
    if (env.type !== 'shared') continue
    const targetLabel = env.targetWorktreeId || env.targetRealPath || 'another worktree'
    if (env.ecosystem === 'python') {
      lines.push(bm.pythonShared(env.envName, targetLabel))
    } else if (env.ecosystem === 'rust') {
      lines.push(bm.rustShared(env.envName, targetLabel))
    } else if (env.ecosystem === 'dotnet') {
      lines.push(bm.dotnetShared(env.envName, targetLabel))
    }
  }

  if (incoming.length > 0) {
    const consumers = incoming.map((i) => {
      const cWt = snapshot.worktrees.find((w) => w.id === i.sourceWorktreeId)
      const activeStr = cWt?.agentStatus.isActive ? ' (AGENT ACTIVE)' : ''
      const mechStr = i.mechanism ? ` [${i.mechanism}]` : ''
      return `\`${i.sourceWorktreeId}\` via \`${i.packageName}\`${mechStr}${activeStr}`
    })
    lines.push(
      `- ⚠️ **DOWNSTREAM BLAST RADIUS:** This worktree is actively consumed via local link/manifest by: ${consumers.join(', ')}. Breaking changes or unbuilt outputs here will immediately impact those worktrees.`,
    )
  }

  if (outgoing.length > 0) {
    lines.push(`- 🔗 **Local Linked Dependencies (Outgoing Links):**`)
    for (const out of outgoing) {
      const targetWt = snapshot.worktrees.find((w) => w.id === out.targetWorktreeId)
      const targetAgent = targetWt?.agentStatus.isActive ? ' (BEING EDITED BY ANOTHER AGENT)' : ''
      const mechStr = out.mechanism ? ` [${out.mechanism}]` : ''
      lines.push(
        `  - \`${out.packageName}\`${mechStr} ➔ \`${out.targetWorktreeId || out.targetRealPath}\` (branch: \`${out.targetBranch || 'unknown'}\`)${out.isBroken ? ' ✖ BROKEN LINK' : ''}${targetAgent}`,
      )
    }
  }

  if (siblingWts.length > 0) {
    lines.push(
      `- 🌿 **Parallel Sibling Worktrees of \`${currentWt.repoAlias}\`:** ${siblingWts.map((s) => `\`${s.id}\` (\`${s.branch}\`${s.agentStatus.isActive ? ' 🤖' : ''})`).join(', ')}`,
    )
  }

  lines.push('')
  lines.push(`## ⚠️ Active Collisions Affecting You (${myWarnings.length})`)
  if (myWarnings.length === 0) {
    lines.push(`- ✅ **Zero collisions.** Your worktree links and branches are properly aligned.`)
  } else {
    for (const w of myWarnings) {
      lines.push(
        `- **[${w.severity.toUpperCase()} - ${w.type}]** ${localizeWarningMessage(w, locale)}`,
      )
      if (w.suggestedFixCommand) {
        lines.push(`  - **Suggested Fix:** \`${w.suggestedFixCommand}\``)
      }
    }
  }

  let exitCode: 0 | 2 | 3 = 0
  if (myWarnings.some((w) => w.severity === 'critical')) {
    exitCode = 2
  } else if (myWarnings.some((w) => w.type === 'BRANCH_MISMATCH')) {
    exitCode = 3
  }

  return {
    matchedWorktree: currentWt,
    markdownBriefing: lines.join('\n') + '\n',
    exitCode,
  }
}

export const AGENT_RULES_SNIPPET = `
<!-- BANYAN-AGENT-RULES-START -->
## 🤖 Banyan Multi-Agent Worktree & Junction Protocol
Before running builds, installing packages, or debugging cross-package issues, run:
\`\`\`bash
banyan-bin --agent-context
\`\`\`
1. **Check your Blast Radius:** Verify if your current worktree has a \`shared\` \`node_modules\` or if other active agents consume your worktree via junctions.
2. **Respect Guardrails:** Never run \`npm install\` inside a worktree with \`nodeModulesType: shared\`.
3. **Branch Alignment:** If \`banyan-bin --agent-context\` reports a \`BRANCH_MISMATCH\` or \`BROKEN_LINK\`, apply or suggest the provided fix command before wasting tokens debugging stale builds.
<!-- BANYAN-AGENT-RULES-END -->
`.trim()
