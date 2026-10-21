import { KNOWLEDGE_BASE, DocTopicId } from './knowledgeBase.js'
import { Locale } from '../i18n/index.js'
import { localizeWarningMessage } from '../i18n/messages.js'
import { EcosystemSnapshot } from '../core/types.js'

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[92m',
  cyan: '\x1b[96m',
  yellow: '\x1b[93m',
  red: '\x1b[91m',
  magenta: '\x1b[95m',
  gray: '\x1b[90m',
}

export function printExplainTopic(topicRaw: string, locale: Locale): string {
  const dict = KNOWLEDGE_BASE[locale] || KNOWLEDGE_BASE.es
  const normalized = topicRaw.trim()
  const key = (Object.keys(dict).find((k) => k.toLowerCase() === normalized.toLowerCase()) ||
    'concepts') as DocTopicId

  const art = dict[key]
  const lines: string[] = []
  const isEs = locale === 'es'

  lines.push('')
  lines.push(`${C.green}${C.bold}📖 BANYAN EXPLAIN [${art.code}]  ${art.title}${C.reset}`)
  lines.push(`${C.gray}${'─'.repeat(80)}${C.reset}`)
  lines.push(`${C.bold}TL;DR:${C.reset} ${art.tlDr}`)
  lines.push('')
  lines.push(`${C.cyan}${C.bold}💡 ${isEs ? 'Analogía Mental' : 'Mental Analogy'}:${C.reset}`)
  lines.push(`   ${art.analogy}`)
  lines.push('')
  lines.push(`${C.yellow}${C.bold}📐 ${isEs ? 'Esquema Visual' : 'Visual Diagram'}:${C.reset}`)
  for (const d of art.diagram) {
    lines.push(`${C.green}   ${d}${C.reset}`)
  }
  lines.push('')
  lines.push(
    `${C.magenta}${C.bold}🤖 ${
      isEs
        ? '¿Por qué es crítico con Agentes de IA en paralelo?'
        : 'Why it matters with parallel AI Agents:'
    }${C.reset}`,
  )
  for (const w of art.whyItMattersForAgents) {
    lines.push(`   • ${w}`)
  }
  lines.push('')
  lines.push(
    `${C.cyan}${C.bold}🔧 ${
      isEs ? 'Cómo actuar / Solución' : 'How to fix / Action Plan'
    }:${C.reset}`,
  )
  for (const f of art.howToFix) {
    lines.push(`   • ${f}`)
  }
  lines.push('')
  lines.push(
    `${C.gray}${
      isEs ? 'Tópicos disponibles para --explain' : 'Available topics for --explain'
    }: ${Object.keys(dict).join(', ')}${C.reset}`,
  )
  lines.push('')
  return lines.join('\n')
}

export function printDoctorReport(snapshot: EcosystemSnapshot, locale: Locale): string {
  const lines: string[] = []
  const isEs = locale === 'es'

  lines.push('')
  lines.push(
    `${C.green}${C.bold}🩺 BANYAN DOCTOR  ${
      isEs ? 'Auditoría Pedagógica del Ecosistema' : 'Ecosystem Pedagogical Health Check'
    }${C.reset}`,
  )
  lines.push(`${C.gray}${'─'.repeat(80)}${C.reset}`)

  // Check 1: Worktrees
  const wtCount = snapshot.worktrees.length
  lines.push(
    `${C.green}[✔] Git Worktrees:${C.reset} ${
      isEs
        ? `${wtCount} árboles detectados en el workspace "${snapshot.workspaceName}".`
        : `${wtCount} worktree(s) detected in workspace "${snapshot.workspaceName}".`
    }`,
  )

  // Check 2: Shared root node_modules
  const sharedRoots = snapshot.worktrees.filter((w) => w.nodeModulesType === 'shared')
  if (sharedRoots.length > 0) {
    lines.push(
      `${C.yellow}[i] ${
        isEs ? 'Raíces node_modules compartidas (🔗nm):' : 'Shared root node_modules (🔗nm):'
      }${C.reset} ${
        isEs
          ? `${sharedRoots.length} worktree(s) comparten toda su carpeta node_modules (${sharedRoots
              .map((w) => w.id)
              .join(', ')}).`
          : `${sharedRoots.length} worktree(s) share their full node_modules directory (${sharedRoots
              .map((w) => w.id)
              .join(', ')}).`
      }`,
    )
    lines.push(
      `    ${C.gray}👉 ${
        isEs
          ? 'Ejecuta "bny --explain shared-nm" para entender qué ocurre si un agente ejecuta npm install ahí.'
          : 'Run "bny --explain shared-nm" to understand what happens if an agent runs npm install there.'
      }${C.reset}`,
    )
  } else {
    lines.push(
      `${C.green}[✔] ${
        isEs ? 'Aislamiento de raíces node_modules:' : 'Root node_modules isolation:'
      }${C.reset} ${
        isEs
          ? 'Ningún worktree comparte la raíz completa.'
          : 'No worktrees share a full root node_modules.'
      }`,
    )
  }

  // Check 3: Package junctions
  lines.push(
    `${C.green}[✔] ${isEs ? 'Junctions de paquetes:' : 'Package junctions:'}${C.reset} ${
      isEs
        ? `${snapshot.junctions.length} enlaces simbólicos inspeccionados.`
        : `${snapshot.junctions.length} package symlinks inspected.`
    }`,
  )

  // Check 4: Collisions
  if (snapshot.warnings.length === 0) {
    lines.push(
      `${C.green}[✔] ${isEs ? 'Colisiones Multi-Agente:' : 'Multi-Agent Collisions:'}${C.reset} ${
        isEs
          ? '0 conflictos detectados. Seguro para programar en paralelo.'
          : '0 conflicts detected. Safe for parallel agent coding.'
      }`,
    )
  } else {
    lines.push(
      `${C.red}[✖] ${isEs ? 'Colisiones Multi-Agente:' : 'Multi-Agent Collisions:'}${C.reset} ${
        isEs
          ? `Se detectaron ${snapshot.warnings.length} problema(s):`
          : `Detected ${snapshot.warnings.length} problem(s):`
      }`,
    )
    for (const w of snapshot.warnings) {
      lines.push(`   • [${w.type}] ${localizeWarningMessage(w, locale)}`)
      lines.push(
        `     ${C.cyan}👉 ${
          isEs
            ? `Para entender este error a fondo ejecuta: bny --explain ${w.type}`
            : `To understand this issue run: bny --explain ${w.type}`
        }${C.reset}`,
      )
    }
  }

  lines.push('')
  return lines.join('\n')
}
