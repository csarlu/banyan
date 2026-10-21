#!/usr/bin/env node
import chalk from 'chalk'

// In PowerShell / Bash wrappers ($target = node ...), stdout is piped to capture
// the cd destination path. This causes chalk/supports-color to default level to 0 (no color)
// because stdout is not a TTY. Since Banyan renders its interactive TUI on process.stderr
// (which is connected to the console terminal), we force chalk level to 3 (Truecolor 24-bit)
// so that all theme palettes and styled borders render with full RGB brilliance.
if (process.env.FORCE_COLOR !== '0') {
  chalk.level = 3
  process.env.FORCE_COLOR = '3'
}

import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { render } from 'ink'
import meow from 'meow'
import { loadConfig } from './core/config.js'
import { buildEcosystemSnapshot } from './core/orchestrator.js'
import { formatStatusReport } from './core/statusPrinter.js'
import { generateAgentBriefing, AGENT_RULES_SNIPPET } from './core/agentBriefing.js'
import { printExplainTopic, printDoctorReport } from './docs/cliDocPrinter.js'
import { openConfigInEditor } from './core/configEditor.js'
import { startMcpServer } from './core/mcpServer.js'
import { App } from './ui/App.js'
import { ThemeName } from './ui/theme.js'
import { detectDefaultLocale, Locale } from './i18n/index.js'
import { getMessages } from './i18n/messages.js'
import { setupPolyglotPlayground } from './core/playground.js'
import { WorkspaceConfig, BanyanConfig } from './core/types.js'

const HELP_EN = `
  Usage
    $ bny [options]

  Options
    --agent-context, -a Tactical Markdown briefing for AI agents (<300 tokens)
    --guard           Safety gatekeeper for hooks/CI (exit code 2 or 3 on alerts)
    --init-agent-rules Inject multi-agent working protocol into AGENTS.md / CLAUDE.md
    --init-shell      Print the shell wrapper function (powershell | bash | zsh) for instant cd jumps
    --explain <topic> Conceptual lesson and pedagogical resolution (e.g. concepts, junctions, BRANCH_MISMATCH)
    --doctor          Step-by-step pedagogical audit of the ecosystem (exit code 2 on critical alerts)
    --workspace, -w   Workspace name from banyan.config.json
    --playground, -p  Create and open an interactive polyglot playground (Go, Rust, .NET, Python, Node)
    --status, -s      Headless status table report
    --tutorial        Start directly in the interactive tutorial & simulator
    --config, -c      Open banyan.config.json in Neovim or your default editor
    --theme, -t       Color theme: default | catppuccin | dracula | nord | monokai | solarized | matrix
    --lang, -l        Language: en | es
    --splash          Show full ASCII Banyan tree on startup
    --json            Output full ecosystem snapshot as JSON
    --mcp             Run as an MCP server over stdio
    --allow-fix       Allow MCP server to execute auto-fix commands (opt-in)
    --cwd             Custom root directory

  Key Concepts
    Worktrees         Isolated Git working trees on disk for agents and developers.
    Junctions/Links   Local symlinks, editable installs or manifest references (Node, Python, Go, Rust, .NET).
    Collisions        Cross-contamination or misaligned branches when agents operate in parallel.

  Examples
    $ bny                         Open the interactive TUI dashboard
    $ bny --playground            Launch a full polyglot sandbox for tests and demos
    $ bny -c                      Open banyan.config.json in Neovim / editor
    $ bny --init-shell            Print the shell wrapper to change directory on Enter
    $ bny --agent-context         Situational briefing for the LLM in the current worktree
    $ bny --guard                 Check whether the current worktree can safely proceed
    $ bny --init-agent-rules      Register the self-awareness rules in AGENTS.md
    $ bny --explain concepts      Explain the Worktree + Junctions architecture
    $ bny --explain BRANCH_MISMATCH  Deep diagnosis of branch misalignment
    $ bny --doctor                Full audit for terminal or CI scripts
    $ bny --status                Quick headless summary table

  Environment Variables
    BANYAN_THEME      Default color theme
    BANYAN_LANG       Default language (en | es)

  Exit Codes
    0                 OK / Clean ecosystem
    1                 Fatal error / Configuration not found
    2                 Critical collisions detected (--doctor or --guard)
    3                 Branch drift / BRANCH_MISMATCH detected with --guard
`

const HELP_ES = `
  Uso
    $ bny [opciones]

  Opciones
    --agent-context, -a Briefing táctico en Markdown para Agentes de IA (<300 tokens)
    --guard           Gatekeeper de seguridad para hooks/CI (exit code 2 o 3 si hay alertas)
    --init-agent-rules Inyecta protocolo de trabajo multi-agente en AGENTS.md / CLAUDE.md
    --init-shell      Imprime la función wrapper de shell (powershell | bash | zsh) para salto cd instantáneo
    --explain <topic> Lección conceptual y resolución pedagógica (ej. concepts, junctions, BRANCH_MISMATCH)
    --doctor          Auditoría pedagógica paso a paso del ecosistema (exit code 2 si hay alertas críticas)
    --workspace, -w   Nombre del workspace en banyan.config.json
    --playground, -p  Crea y abre un playground políglota interactivo (Go, Rust, .NET, Python, Node)
    --status, -s      Tabla de estado en modo headless
    --tutorial        Arranca directamente en el tutorial interactivo y simulador
    --config, -c      Abre banyan.config.json en Neovim o tu editor predeterminado
    --theme, -t       Tema de color: default | catppuccin | dracula | nord | monokai | solarized | matrix
    --lang, -l        Idioma: en | es
    --splash          Muestra el árbol ASCII completo de Banyan al arrancar
    --json            Vuelca el snapshot completo del ecosistema como JSON
    --mcp             Ejecuta como servidor MCP por stdio
    --allow-fix       Permite al servidor MCP ejecutar comandos de auto-fix (opt-in)
    --cwd             Directorio raíz personalizado

  Conceptos Clave
    Worktrees         Árboles de trabajo Git aislados en disco para agentes y desarrolladores.
    Junctions/Links   Enlaces simbólicos, editables o manifiestos locales (Node, Python, Go, Rust, .NET).
    Collisions        Contaminación cruzada o ramas desalineadas cuando operan agentes en paralelo.

  Ejemplos
    $ bny                         Abre el panel TUI interactivo
    $ bny --playground            Lanza sandbox políglota completo para pruebas y demos
    $ bny -c                      Abre banyan.config.json en Neovim / editor
    $ bny --init-shell            Imprime el wrapper de shell para cambiar de carpeta al pulsar Enter
    $ bny --agent-context         Briefing situacional para el LLM en el worktree actual
    $ bny --guard                 Verifica si el worktree actual puede proceder sin peligro
    $ bny --init-agent-rules      Registra las reglas de autoconciencia en AGENTS.md
    $ bny --explain concepts      Explica la arquitectura Worktree + Junctions
    $ bny --explain BRANCH_MISMATCH  Diagnóstico profundo de desalineación de ramas
    $ bny --doctor                Auditoría completa para terminal o scripts de CI
    $ bny --status                Tabla resumen rápida en modo headless

  Variables de Entorno
    BANYAN_THEME      Tema de color predeterminado
    BANYAN_LANG       Idioma predeterminado (en | es)

  Códigos de Salida
    0                 OK / Ecosistema limpio
    1                 Error fatal / Configuración no encontrada
    2                 Colisiones críticas detectadas (--doctor o --guard)
    3                 Desfase de ramas / BRANCH_MISMATCH detectado con --guard
`

/** Resolves the help language before meow parses flags (config is not loaded yet). */
function resolveHelpLocale(argv: string[] = process.argv.slice(2)): Locale {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if ((a === '--lang' || a === '-l') && argv[i + 1])
      return argv[i + 1].toLowerCase().startsWith('es') ? 'es' : 'en'
    if (a.startsWith('--lang=')) return a.slice(7).toLowerCase().startsWith('es') ? 'es' : 'en'
  }
  return detectDefaultLocale()
}

const cli = meow(resolveHelpLocale() === 'es' ? HELP_ES : HELP_EN, {
  importMeta: import.meta,
  // meow only auto-shows help when --help is the sole argument; handle it ourselves so
  // combinations such as `bny --lang es --help` work.
  autoHelp: false,
  flags: {
    help: { type: 'boolean', shortFlag: 'h', default: false },
    agentContext: { type: 'boolean', shortFlag: 'a', default: false },
    guard: { type: 'boolean', default: false },
    initAgentRules: { type: 'boolean', default: false },
    initShell: { type: 'boolean', default: false },
    explain: { type: 'string' },
    doctor: { type: 'boolean', default: false },
    workspace: { type: 'string', shortFlag: 'w' },
    playground: { type: 'boolean', shortFlag: 'p', default: false },
    status: { type: 'boolean', shortFlag: 's', default: false },
    tutorial: { type: 'boolean', default: false },
    config: { type: 'boolean', shortFlag: 'c', default: false },
    theme: { type: 'string', shortFlag: 't' },
    lang: { type: 'string', shortFlag: 'l' },
    splash: { type: 'boolean', default: true },
    json: { type: 'boolean', default: false },
    mcp: { type: 'boolean', default: false },
    allowFix: { type: 'boolean', default: false },
    cwd: { type: 'string' },
  },
})

export function generateShellInitScript(shellHint?: string): string {
  const hint = (shellHint || (process.platform === 'win32' ? 'powershell' : 'bash')).toLowerCase()
  if (hint === 'powershell' || hint === 'pwsh' || hint === 'ps1') {
    return [
      '# --- BANYAN (Polyglot Agentic Worktree & Dependency Orchestrator) ---',
      '# Add to your PowerShell $PROFILE: Invoke-Expression (& banyan-bin --init-shell)',
      'function bny {',
      '    $env:FORCE_COLOR = "3"',
      '    $target = banyan-bin @args',
      '    if ($LASTEXITCODE -eq 0 -and $target -and (Test-Path $target)) {',
      '        Set-Location $target',
      '    }',
      '}',
      '# --- END BANYAN ---',
    ].join('\n')
  }
  return [
    '# --- BANYAN (Polyglot Agentic Worktree & Dependency Orchestrator) ---',
    '# Add to your ~/.bashrc or ~/.zshrc: eval "$(banyan-bin --init-shell)"',
    'bny() {',
    '  local target',
    '  target="$(FORCE_COLOR=3 banyan-bin "$@")"',
    '  local exit_code=$?',
    '  if [ $exit_code -eq 0 ] && [ -n "$target" ] && [ -d "$target" ]; then',
    '    cd "$target" || return',
    '  fi',
    '  return $exit_code',
    '}',
    '# --- END BANYAN ---',
  ].join('\n')
}

function resolveTheme(wsConfig?: WorkspaceConfig, rConfig?: BanyanConfig): ThemeName {
  return (cli.flags.theme ||
    process.env.BANYAN_THEME ||
    wsConfig?.theme ||
    rConfig?.theme ||
    'default') as ThemeName
}

function resolveLocale(wsConfig?: WorkspaceConfig, rConfig?: BanyanConfig): Locale {
  return (
    (cli.flags.lang as Locale) ||
    (process.env.BANYAN_LANG as Locale) ||
    wsConfig?.lang ||
    rConfig?.lang ||
    detectDefaultLocale()
  )
}

async function resolveLocaleSafe(baseCwd: string): Promise<Locale> {
  try {
    const loaded = await loadConfig(baseCwd, cli.flags.workspace)
    return resolveLocale(loaded.workspace, loaded.rawConfig)
  } catch {
    return resolveLocale()
  }
}

async function main() {
  if (cli.flags.help) {
    cli.showHelp(0)
  }

  if (cli.flags.initShell) {
    const shellArg = cli.input[0]
    process.stdout.write(generateShellInitScript(shellArg) + '\n')
    process.exit(0)
  }

  const baseCwd = cli.flags.cwd || process.cwd()

  if (cli.flags.explain) {
    let explainLocale = (cli.flags.lang as Locale) || (process.env.BANYAN_LANG as Locale)
    if (!explainLocale) {
      try {
        const loaded = await loadConfig(baseCwd, cli.flags.workspace)
        explainLocale = loaded.workspace.lang || loaded.rawConfig?.lang || detectDefaultLocale()
      } catch {
        explainLocale = detectDefaultLocale()
      }
    }
    process.stderr.write(printExplainTopic(cli.flags.explain, explainLocale))
    process.exit(0)
  }

  if (cli.flags.mcp) {
    await startMcpServer(baseCwd, { allowFix: Boolean(cli.flags.allowFix) })
    process.exit(0)
  }

  if (cli.flags.config) {
    const cm = getMessages(await resolveLocaleSafe(baseCwd)).cli
    const result = await openConfigInEditor(baseCwd)
    if (!result.ok) {
      process.stderr.write(cm.editorError(result.editor, String(result.error)) + '\n')
      process.exit(1)
    }
    process.stderr.write(cm.configEdited(path.basename(result.filePath), result.editor) + '\n')
    process.exit(0)
  }

  if (cli.flags.initAgentRules) {
    const cm = getMessages(await resolveLocaleSafe(baseCwd)).cli
    const agentsPath = path.join(baseCwd, 'AGENTS.md')
    const claudePath = path.join(baseCwd, 'CLAUDE.md')

    let targetFile = agentsPath
    let existingContent = ''

    if (fs.existsSync(agentsPath)) {
      targetFile = agentsPath
      existingContent = fs.readFileSync(agentsPath, 'utf8')
    } else if (fs.existsSync(claudePath)) {
      targetFile = claudePath
      existingContent = fs.readFileSync(claudePath, 'utf8')
    }

    if (!existingContent.includes('BANYAN-AGENT-RULES-START')) {
      const newContent = existingContent
        ? `${existingContent.trimEnd()}\n\n${AGENT_RULES_SNIPPET}\n`
        : `${AGENT_RULES_SNIPPET}\n`
      fs.writeFileSync(targetFile, newContent, 'utf8')
      process.stderr.write(cm.rulesAdded(path.basename(targetFile)) + '\n')
    } else {
      process.stderr.write(cm.rulesPresent(path.basename(targetFile)) + '\n')
    }
    process.exit(0)
  }

  if (cli.flags.playground) {
    const playgroundLocale = await resolveLocaleSafe(baseCwd)
    const pcm = getMessages(playgroundLocale).cli
    process.stderr.write(pcm.playgroundCreating + '\n')
    const pg = await setupPolyglotPlayground(cli.flags.cwd, playgroundLocale)
    process.stderr.write(pcm.playgroundReady(pg.playgroundDir) + '\n')
    process.stderr.write(pcm.playgroundEcosystems + '\n')

    const loaded = await loadConfig(pg.playgroundDir, pg.workspaceName)
    const pgTheme = resolveTheme(loaded.workspace, loaded.rawConfig)
    const pgLocale = resolveLocale(loaded.workspace, loaded.rawConfig)

    let selectedCdPath: string | null = null
    if (process.stderr.isTTY) {
      process.stderr.write('\x1b[?1049h\x1b[2J\x1b[H')
    }

    try {
      const instance = render(
        <App
          baseCwd={pg.playgroundDir}
          configPath={loaded.configPath}
          rawConfig={loaded.rawConfig}
          workspaceName={loaded.workspaceName}
          workspaceConfig={loaded.workspace}
          showSplashInitially={cli.flags.splash}
          startInTutorial={cli.flags.tutorial}
          initialTheme={pgTheme}
          initialLocale={pgLocale}
          isThemeExplicit={Boolean(cli.flags.theme || process.env.BANYAN_THEME)}
          isLocaleExplicit={Boolean(cli.flags.lang || process.env.BANYAN_LANG)}
          onSelectWorktreeForCd={(targetPath) => {
            selectedCdPath = targetPath
          }}
        />,
        { stdout: process.stderr, stdin: process.stdin },
      )

      await instance.waitUntilExit()
    } finally {
      if (process.stderr.isTTY) {
        process.stderr.write('\x1b[?1049l')
      }
    }

    if (selectedCdPath) {
      process.stdout.write(selectedCdPath + '\n')
    }
    process.stderr.write(pcm.playgroundDone(pg.playgroundDir))
    process.exit(0)
  }

  const { workspaceName, workspace, configPath, rawConfig } = await loadConfig(
    baseCwd,
    cli.flags.workspace,
  )
  const themeName = resolveTheme(workspace, rawConfig)
  const locale = resolveLocale(workspace, rawConfig)

  if (cli.flags.doctor) {
    const snapshot = await buildEcosystemSnapshot(workspaceName, workspace)
    process.stderr.write(printDoctorReport(snapshot, locale))
    const hasCritical = snapshot.warnings.some((w) => w.severity === 'critical')
    process.exit(hasCritical ? 2 : 0)
  }

  if (cli.flags.agentContext) {
    const snapshot = await buildEcosystemSnapshot(workspaceName, workspace)
    const { markdownBriefing } = generateAgentBriefing(snapshot, baseCwd, locale)
    process.stdout.write(markdownBriefing)
    process.exit(0)
  }

  if (cli.flags.guard) {
    const snapshot = await buildEcosystemSnapshot(workspaceName, workspace)
    const { markdownBriefing, exitCode } = generateAgentBriefing(snapshot, baseCwd, locale)
    if (exitCode !== 0) {
      process.stderr.write(markdownBriefing)
      process.exit(exitCode)
    }
    process.stderr.write(getMessages(locale).cli.guardOk + '\n')
    process.exit(0)
  }

  if (cli.flags.json) {
    const snapshot = await buildEcosystemSnapshot(workspaceName, workspace)
    process.stdout.write(JSON.stringify(snapshot, null, 2) + '\n')
    process.exit(0)
  }

  if (cli.flags.status) {
    const snapshot = await buildEcosystemSnapshot(workspaceName, workspace)
    process.stderr.write(formatStatusReport(snapshot, locale))
    process.exit(0)
  }

  let selectedCdPath: string | null = null

  if (process.stderr.isTTY) {
    process.stderr.write('\x1b[?1049h\x1b[2J\x1b[H')
  }

  try {
    const instance = render(
      <App
        baseCwd={baseCwd}
        configPath={configPath}
        rawConfig={rawConfig}
        workspaceName={workspaceName}
        workspaceConfig={workspace}
        showSplashInitially={cli.flags.splash}
        startInTutorial={cli.flags.tutorial}
        initialTheme={themeName}
        initialLocale={locale}
        isThemeExplicit={Boolean(cli.flags.theme || process.env.BANYAN_THEME)}
        isLocaleExplicit={Boolean(cli.flags.lang || process.env.BANYAN_LANG)}
        onSelectWorktreeForCd={(targetPath) => {
          selectedCdPath = targetPath
        }}
      />,
      { stdout: process.stderr, stdin: process.stdin },
    )

    await instance.waitUntilExit()
  } finally {
    if (process.stderr.isTTY) {
      process.stderr.write('\x1b[?1049l')
    }
  }

  if (selectedCdPath) {
    process.stdout.write(selectedCdPath + '\n')
  }
}

if (!process.env.VITEST) {
  main().catch((err) => {
    console.error('Fatal error in Banyan:', err)
    process.exit(1)
  })
}
