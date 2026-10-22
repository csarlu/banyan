export type Locale = 'es' | 'en'

export const DICTIONARIES = {
  es: {
    subtitle: 'Orquestador Políglota de Worktrees y Enlaces Locales',
    headerHint:
      '\uf05a [i] Leyenda  \uf065 [K] Nombres  \uf1bb [b] Splash  \uf0eb [e] Explicar  \uf53f [t] Tema  \uf0ac [L] Idioma  \uf02d [4/?] Tutorial',
    scanning: ' Escaneando repositorios, worktrees y dependencias locales...',
    tabs: {
      wt: 'Worktrees',
      jn: 'Enlaces & Deps',
      hl: 'Salud & Colisiones',
      tut: 'Tutorial',
      cfg: 'Config',
    },
    status: {
      agents: 'Agente(s) Activo(s)',
      scanning: ' Escaneando...',
      live: ' En vivo',
      paused: ' Pausado',
      help: '[h/l] Paneles  [j/k] Nav  [i] Leyenda  [K] Nombres  [Enter] Ir(cd)  [1-5/Tab] Pestañas  [c] Config  [e] Explicar  [p] Pausa  [r] Recargar  [t] Tema  [L] ES/EN  [q] Salir',
    },
    wtTab: {
      title: 'Worktrees & Ramas',
      empty: 'No se detectaron repositorios Git.',
      select: 'Selecciona un worktree.',
      inspector: 'Inspector',
      rootNm: ' Entorno Raíz:',
      nmShared: ' COMPARTIDO',
      nmOwn: 'Carpeta propia (aislada)',
      nmNone: 'No instalado',
      agent: ' Agente detectado',
      jnTitle: ' Enlaces y Dependencias Locales:',
      noJn: '  Sin enlaces ni dependencias locales entrantes o salientes.',
      consumes: 'consume',
      usedBy: 'usado por',
      graph: ' Grafo Git Reciente:',
      noCommits: '  Sin commits.',
    },
    jnTab: {
      title: '  Topología Políglota de Enlaces y Dependencias Locales',
      sharedRoots: ' Entornos Raíz Compartidos (node_modules, .venv, target, obj):',
      empty: 'No se detectaron enlaces ni dependencias locales entre worktrees.',
      broken: ' ROTO',
      branch: 'rama',
      external: ' Externo',
    },
    hlTab: {
      title: '  Diagnóstico de Aislamiento & Salud Multi-Agente',
      alerts: 'alerta(s) activa(s)',
      okTitle: ' Ecosistema 100% saludable y aislado.',
      okSub: 'Ningún worktree comparte dependencias sucias ni tiene ramas desalineadas.',
      crit: ' CRÍTICO',
      warn: ' AVISO',
      affects: 'Afecta a',
      fix: ' Auto-Fix sugerido:',
    },
    tutTab: {
      title: ' Guía Interactiva & Simulador Agéntico',
      nav: 'Usa [h / l], [◄ / ►] o [Espacio] para cambiar de lección.',
      steps: [
        {
          h: '1/3 · El Problema: Agentes en Paralelo + Dependencias Locales',
          b: [
            'Cuando varios agentes (Claude, Aider, Cursor) operan a la vez, Git aísla sus ramas con git worktree.',
            'Pero los enlaces locales (node_modules, go.mod, Cargo.toml, .venv, .csproj) rompen ese aislamiento.',
            'Banyan audita en tiempo real qué agente toca qué árbol y qué enlaces corren peligro.',
          ],
          d: [
            '   Agente A  [app:wt-login]    ',
            '                                        [common:main] (¡Peligro de colisión!)',
            '   Agente B  [app:wt-checkout] ',
          ],
          tip: 'Tip: Pulsa [t] ahora mismo para probar las 6 paletas de colores disponibles.',
        },
        {
          h: '2/3 · Reglas de Colisión y Auto-Fix',
          b: [
            ' MULTI_CONSUMER_DIRTY: 2+ worktrees apuntan a una librería sucia o con un agente activo.',
            ' BRANCH_MISMATCH: Tu worktree está en la rama X, apunta a la rama Y, pero existe un hermano en la rama X.',
            ' Entornos Raíz Compartidos: Detecta si node_modules, .venv, target/ u obj/ cuelgan de otro worktree.',
          ],
          d: [
            '   Actual:   [app:feat-auth] [@acme/common] [common:develop]',
            '   Hermano:  Existe [common:feat-auth] en tu disco',
            '   Fix:     cmd /c rmdir "..." && mklink /J "..." ".../common-feat-auth"',
          ],
          tip: 'Tip: Puedes ejecutar "bny --status" o "bny -s" en consola para ver este reporte en CI/scripts.',
        },
        {
          h: '3/3 · Salto Instantáneo (cd) y Multiplexores (psmux / tmux)',
          b: [
            'Banyan dibuja la interfaz en stderr y emite la ruta elegida por stdout al pulsar [Enter].',
            'Así la función wrapper "bny" de tu shell cambia de directorio al instante.',
            'Además detecta automáticamente psmux en Windows y tmux en Linux/macOS:',
          ],
          d: [
            '  [Enter]  Cambia el directorio de tu terminal al worktree seleccionado',
            '  [s]      Abre un Split horizontal en psmux/tmux en ese worktree',
            '  [w]      Abre una Ventana nueva en psmux/tmux para otro agente',
          ],
          tip: 'Tip: Pulsa [l] en cualquier momento para alternar toda la interfaz entre Español e Inglés.',
        },
      ],
    },
    cfgTab: {
      title: '  Gestor de Configuración del Ecosistema',
      activeFile: 'Archivo de Configuración Activo:',
      detectedEditor: 'Editor Detectado:',
      muxActive: 'psmux/tmux activo',
      workspaceTitle: 'Workspace Activo:',
      reposConfigured: 'Repositorios Gestionados:',
      adaptersTitle: 'Adaptadores:',
      agentTitle: 'Detección Agéntica:',
      jsonPreview: 'Vista Previa de banyan.config.json:',
      actions:
        '[o / Enter] Inline   [s] Split (mux)   [v] Tab/Ventana   [w] Workspace   [r] Recargar',
      notFound: 'No se encontró archivo de configuración (usando valores automáticos en memoria).',
      createHint: 'Pulsa [o], [s] o [v] para crear y abrir banyan.config.json automáticamente.',
      workspacesAvailable: 'Workspaces definidos:',
    },
  },
  en: {
    subtitle: 'Polyglot Worktree & Local Link Orchestrator',
    headerHint:
      '\uf05a [i] Legend  \uf065 [K] Full Name  \uf1bb [b] Splash  \uf0eb [e] Explain  \uf53f [t] Theme  \uf0ac [L] Lang  \uf02d [4/?] Tutorial',
    scanning: ' Scanning repositories, worktrees and local dependencies...',
    tabs: {
      wt: 'Worktrees',
      jn: 'Links & Deps',
      hl: 'Health & Collisions',
      tut: 'Tutorial',
      cfg: 'Config',
    },
    status: {
      agents: 'Active Agent(s)',
      scanning: ' Scanning...',
      live: ' Live',
      paused: ' Paused',
      help: '[h/l] Panels  [j/k] Nav  [i] Legend  [K] Full Name  [Enter] Jump(cd)  [1-5/Tab] Tabs  [c] Config  [e] Explain  [p] Pause  [r] Refresh  [t] Theme  [L] ES/EN  [q] Quit',
    },
    wtTab: {
      title: 'Worktrees & Branches',
      empty: 'No Git repositories detected.',
      select: 'Select a worktree.',
      inspector: 'Inspector',
      rootNm: ' Root Env:',
      nmShared: ' SHARED',
      nmOwn: 'Own folder (isolated)',
      nmNone: 'Not installed',
      agent: ' Active Agent',
      jnTitle: ' Local Package & Manifest Links:',
      noJn: '  No incoming or outgoing local links.',
      consumes: 'consumes',
      usedBy: 'used by',
      graph: ' Recent Git Graph:',
      noCommits: '  No commits.',
    },
    jnTab: {
      title: '  Polyglot Local Dependency & Link Topology',
      sharedRoots: ' Shared Root Environments (node_modules, .venv, target, obj):',
      empty: 'No local cross-worktree links or dependencies detected.',
      broken: ' BROKEN',
      branch: 'branch',
      external: ' External',
    },
    hlTab: {
      title: '  Multi-Agent Isolation & Health Diagnostics',
      alerts: 'active alert(s)',
      okTitle: ' Ecosystem 100% healthy and isolated.',
      okSub: 'No worktrees share dirty dependencies or have branch-misaligned links.',
      crit: ' CRITICAL',
      warn: ' WARNING',
      affects: 'Affects',
      fix: ' Suggested Auto-Fix:',
    },
    tutTab: {
      title: ' Interactive Guide & Agentic Simulator',
      nav: 'Use [h / l], [◄ / ►] or [Space] to switch lessons.',
      steps: [
        {
          h: '1/3 · The Problem: Parallel AI Agents + Local Dependencies',
          b: [
            'When multiple agents (Claude, Aider, Cursor) run in parallel, Git isolates branches via git worktree.',
            'However, local dependency links (node_modules, go.mod, Cargo.toml, .venv, .csproj) break that isolation.',
            'Banyan audits in real time which agent touches which tree and which links are at risk.',
          ],
          d: [
            '   Agent A  [app:wt-login]    ',
            '                                       [common:main] (Collision hazard!)',
            '   Agent B  [app:wt-checkout] ',
          ],
          tip: 'Tip: Press [t] right now to cycle through the 6 built-in color palettes.',
        },
        {
          h: '2/3 · Collision Rules & Auto-Fix',
          b: [
            ' MULTI_CONSUMER_DIRTY: 2+ worktrees point to a dirty or agent-active library.',
            ' BRANCH_MISMATCH: Worktree is on branch X, links to branch Y, while a sibling on branch X exists.',
            ' Shared Root Envs: Detects when node_modules, .venv, target/ or obj/ is shared across worktrees.',
          ],
          d: [
            '   Current: [app:feat-auth] [@acme/common] [common:develop]',
            '   Sibling:  Found [common:feat-auth] on disk',
            '   Fix:     cmd /c rmdir "..." && mklink /J "..." ".../common-feat-auth"',
          ],
          tip: 'Tip: Run "bny --status" or "bny -s" for headless CI/script reporting.',
        },
        {
          h: '3/3 · Instant Jump (cd) & Multiplexers (psmux / tmux)',
          b: [
            'Banyan renders its TUI to stderr and outputs the chosen path to stdout on [Enter].',
            'This allows the "bny" shell wrapper to switch your working directory instantaneously.',
            'It also auto-detects psmux on Windows and tmux on Linux/macOS:',
          ],
          d: [
            '  [Enter]  Changes your shell working directory to the selected worktree',
            '  [s]      Opens a horizontal Split in psmux/tmux at that worktree',
            '  [w]      Opens a new Window in psmux/tmux ready for another agent',
          ],
          tip: 'Tip: Press [l] anytime to toggle the entire UI between Spanish and English.',
        },
      ],
    },
    cfgTab: {
      title: '  Ecosystem Configuration Manager',
      activeFile: 'Active Configuration File:',
      detectedEditor: 'Detected Editor:',
      muxActive: 'psmux/tmux active',
      workspaceTitle: 'Active Workspace:',
      reposConfigured: 'Managed Repositories:',
      adaptersTitle: 'Adapters:',
      agentTitle: 'Agent Detection:',
      jsonPreview: 'banyan.config.json Preview:',
      actions: '[o / Enter] Inline   [s] Split (mux)   [v] Tab/Window   [w] Workspace   [r] Reload',
      notFound: 'No configuration file found (using in-memory automatic defaults).',
      createHint: 'Press [o], [s] or [v] to create and open banyan.config.json automatically.',
      workspacesAvailable: 'Defined workspaces:',
    },
  },
}

export function detectDefaultLocale(): Locale {
  const envLang = (
    process.env.BANYAN_LANG ||
    process.env.LC_ALL ||
    process.env.LANG ||
    ''
  ).toLowerCase()
  return envLang.startsWith('es') ? 'es' : 'en'
}
