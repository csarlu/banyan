import { Locale } from '../i18n/index.js'

export type DocTopicId =
  | 'concepts'
  | 'junctions'
  | 'shared-nm'
  | 'agents'
  | 'MULTI_CONSUMER_DIRTY'
  | 'BRANCH_MISMATCH'
  | 'BROKEN_LINK'
  | 'SHARED_ENV_DIRTY'
  | 'EXTERNAL_TARGET'
  | 'MISSING_REPO'

export const DOC_TOPICS: DocTopicId[] = [
  'concepts',
  'junctions',
  'shared-nm',
  'agents',
  'MULTI_CONSUMER_DIRTY',
  'BRANCH_MISMATCH',
  'BROKEN_LINK',
  'SHARED_ENV_DIRTY',
  'EXTERNAL_TARGET',
  'MISSING_REPO',
]

export interface PedagogicalArticle {
  id: DocTopicId
  code: string
  title: string
  tlDr: string
  analogy: string
  diagram: string[]
  whyItMattersForAgents: string[]
  howToFix: string[]
}

export const KNOWLEDGE_BASE: Record<Locale, Record<DocTopicId, PedagogicalArticle>> = {
  es: {
    concepts: {
      id: 'concepts',
      code: 'DOC-01',
      title: 'Worktrees + Node Modules + Junctions: El Tablero de Juego',
      tlDr: 'Git aísla tu código en carpetas separadas (worktrees), pero los enlaces simbólicos (junctions) dentro de node_modules actúan como túneles secretos que conectan esas carpetas por debajo.',
      analogy:
        'Imagina que cada Worktree es un apartamento independiente para que un Agente de IA trabaje sin molestar a otro. Sin embargo, para ahorrar espacio o probar librerías locales, abres "portales mágicos" (Junctions) en las paredes que comunican la cocina de todos los apartamentos con un único almacén central.',
      diagram: [
        '  [Worktree A: App Login] ───────(junction @scope/common)───────▶',
        '                                                                 ▼',
        '                                              [ Worktree Librería Common ]',
        '                                                                 ▲',
        '  [Worktree B: App Experimento] ──(junction @scope/common)───────▶',
      ],
      whyItMattersForAgents: [
        'Cuando trabajas tú solo, recuerdas qué carpeta apunta a dónde.',
        'Cuando tienes 3 agentes (Claude Code, Aider, Cursor) editando en paralelo, un agente puede modificar una librería compartida y romper instantáneamente la compilación de otro agente en otro worktree.',
      ],
      howToFix: [
        'Usa la pestaña [2] Junctions para auditar qué portales tienes abiertos.',
        'Revisa la pestaña [3] Salud antes de lanzar múltiples agentes en paralelo.',
      ],
    },
    junctions: {
      id: 'junctions',
      code: 'DOC-02',
      title: '¿Qué es un NTFS Junction / Symlink de paquete?',
      tlDr: 'Es un atajo a nivel de sistema operativo dentro de node_modules/@scope/paquete que redirige hacia otra carpeta de tu disco duro donde tienes el código fuente de esa librería.',
      analogy:
        'En lugar de empaquetar y subir tu librería a internet (npm) cada vez que cambias una línea de código, creas un portal directo para que tu aplicación lea la librería en vivo desde tu carpeta local.',
      diagram: [
        '  web-app/node_modules/@acme/common ──(Portal Junction)──▶ C:\\projects\\acme-common',
      ],
      whyItMattersForAgents: [
        'Los agentes no suelen saber que una carpeta dentro de node_modules es en realidad otro repositorio Git vivo.',
        'Si la librería destino cambia de rama o tiene errores de compilación, todos los worktrees conectados a ella fallarán a la vez.',
      ],
      howToFix: [
        'Crea un worktree específico de la librería para cada feature grande y enlázalo con mklink /J (Windows) o ln -s (Linux/macOS).',
      ],
    },
    'shared-nm': {
      id: 'shared-nm',
      code: 'DOC-03',
      title: 'Raíz node_modules Compartida (Badge 🔗nm vs own)',
      tlDr: 'Indica que TODA la carpeta node_modules de un worktree es un portal (junction) apuntando al node_modules de otro worktree principal para ahorrar gigabytes de disco y evitar hacer npm install.',
      analogy:
        'Es como si dos coches distintos compartieran el mismo motor físico mediante un cable dimensional. Si un mecánico desmonta una pieza en el Coche B, el Coche A deja de arrancar.',
      diagram: [
        '  [Worktree Secundario] /node_modules (🔗nm) ──(Junction Raíz)──▶ [Worktree Principal] /node_modules (own)',
      ],
      whyItMattersForAgents: [
        'Si un agente en el worktree secundario ejecuta "npm install nueva-lib" o "npm uninstall", modificará silenciosamente las dependencias del worktree principal.',
      ],
      howToFix: [
        'Si un agente va a instalar o actualizar paquetes del package.json, dale su propia carpeta node_modules independiente ("own") eliminando el junction raíz y ejecutando npm/pnpm install.',
      ],
    },
    agents: {
      id: 'agents',
      code: 'DOC-04',
      title: 'Radar de Agentes Activos ([🤖 AGENT])',
      tlDr: 'Banyan detecta en tiempo real si un humano o un Agente de IA está operando sobre un worktree sin necesidad de plugins.',
      analogy:
        'Es un sensor de movimiento por infrarrojos instalado en cada rama de tu repositorio.',
      diagram: [
        '  Señal 1: Bloqueo de Git (.git/index.lock activo)',
        '  Señal 2: Archivos de sesión (.aider*, .claude*, .cursor.lock)',
        '  Señal 3: Heartbeat de disco (archivos modificados en los últimos 45s)',
        '  Señal 4: Panel de terminal abierto en psmux (Windows) o tmux (Linux)',
      ],
      whyItMattersForAgents: [
        'Evita que borres, cambies de rama o hagas merge sobre un worktree mientras un agente está escribiendo código en él.',
      ],
      howToFix: [
        'Espera a que el indicador [🤖 AGENT] desaparezca antes de eliminar o re-enlazar un worktree.',
      ],
    },
    MULTI_CONSUMER_DIRTY: {
      id: 'MULTI_CONSUMER_DIRTY',
      code: 'ERR-COLLISION-01',
      title: 'Contaminación Cruzada (MULTI_CONSUMER_DIRTY)',
      tlDr: 'Dos o más worktrees están consumiendo simultáneamente una misma librería local, y esa librería tiene cambios sin guardar (dirty) o un agente modificándola en vivo.',
      analogy:
        'Dos cocineros intentando preparar platos distintos usando la misma sartén al mismo tiempo mientras uno de ellos le echa picante sin avisar al otro.',
      diagram: [
        '  [Agente 1: App Estable]     ──(consume)──▶',
        '                                            ▼',
        '                             [ Librería Common: ⚠️ 4 archivos sucios / 🤖 Agente ]',
        '                                            ▲',
        '  [Agente 2: App Experimento] ──(consume)──▶',
      ],
      whyItMattersForAgents: [
        'El Agente 1 sufrirá errores fantasma causados por los cambios en caliente del Agente 2 y entrará en un bucle infinito intentando arreglar código que él no ha roto.',
      ],
      howToFix: [
        'Pulsa [f] para crear un worktree limpio en la rama activa de la librería y re-enlazar automáticamente a los consumidores.',
        'O haz commit / stash de los cambios en la librería compartida si quieres que todos consuman la misma copia.',
      ],
    },
    BRANCH_MISMATCH: {
      id: 'BRANCH_MISMATCH',
      code: 'WARN-COLLISION-02',
      title: 'Espejismo de Rama Desalineada (BRANCH_MISMATCH)',
      tlDr: 'Tu worktree está en la rama "X", su enlace apunta a la librería en la rama "Y", ¡pero Banyan ha descubierto que ya tienes otro worktree de esa librería en la rama "X" que olvidaste enlazar!',
      analogy:
        'Has comprado un mando nuevo para el televisor del salón, pero sigue emparejado por Bluetooth con el televisor viejo del dormitorio. Pulsas los botones y crees que no funciona, pero estás cambiando de canal en otra habitación.',
      diagram: [
        '  [App (rama: feat-login)]',
        '       (Lo que crees que pasa) ──▶ [common (rama: feat-login)] (Existe en disco pero ignorado)',
        '       (Realidad actual ⚠️)     ──▶ [common (rama: develop)]',
      ],
      whyItMattersForAgents: [
        'Esta alerta solo salta cuando existe un worktree hermano de la dependencia con el mismo nombre de rama (heurística: mismo nombre de rama = pareja intencionada).',
        'El agente edita archivos en "common (feat-login)", luego compila "App (feat-login)" y ve que sus cambios no surten efecto. Gasta miles de tokens reescribiendo código porque lee el enlace equivocado.',
      ],
      howToFix: [
        'Pulsa [f] (o copia el comando con [y]) para redirigir el enlace o manifiesto hacia el worktree hermano con la misma rama.',
      ],
    },
    BROKEN_LINK: {
      id: 'BROKEN_LINK',
      code: 'ERR-COLLISION-03',
      title: 'Portal Fantasma / Enlace Roto (BROKEN_LINK)',
      tlDr: 'Un paquete dentro de node_modules es un junction que apunta a una carpeta que fue borrada del disco duro.',
      analogy:
        'Una puerta que da al vacío porque derribaron el edificio de al lado tras terminar una obra.',
      diagram: ['  [App]/node_modules/@scope/pkg ──(Junction)──▶ ✖ C:\\ruta\\borrada (No existe)'],
      whyItMattersForAgents: [
        'Cualquier comando de compilación, test o linter lanzado por el agente fallará inmediatamente con errores crípticos de sistema de archivos (ENOENT).',
      ],
      howToFix: [
        'Elimina el junction huérfano con el comando sugerido o vuelve a enlazarlo a un worktree vivo.',
      ],
    },
    SHARED_ENV_DIRTY: {
      id: 'SHARED_ENV_DIRTY',
      code: 'WARN-COLLISION-05',
      title: 'Entorno Raíz Compartido Sucio (SHARED_ENV_DIRTY)',
      tlDr: 'Un worktree con entorno compartido (node_modules, .venv, etc.) tiene dependencias modificadas o sucias que afectan al worktree principal o a otros consumidores.',
      analogy:
        'Varios compañeros de piso comparten la misma nevera comunitaria. Si uno deja comida caducada o cambia los ingredientes, todos los demás sufrirán la intoxicación al cocinar.',
      diagram: [
        '  [Worktree Secundario] (🔗nm compartido) ──▶ [Worktree Principal] (node_modules sucio ⚠️)',
        '                                                   ▲',
        '  [Worktree Terciario]  (🔗nm compartido) ─────────┘',
      ],
      whyItMattersForAgents: [
        'Los paquetes instalados o desinstalados por un agente en un worktree contaminan instantáneamente la resolución de dependencias de los demás agentes.',
      ],
      howToFix: [
        'Aísla el entorno del worktree creando su propio node_modules/.venv independiente ("own"), o sincroniza las dependencias antes de continuar.',
      ],
    },
    EXTERNAL_TARGET: {
      id: 'EXTERNAL_TARGET',
      code: 'WARN-COLLISION-04',
      title: 'Dependencia Externa Fuera del Radar (EXTERNAL_TARGET)',
      tlDr: 'Un paquete de node_modules apunta a una carpeta real de tu disco, pero esa carpeta no pertenece a ninguno de los repositorios monitoreados por Banyan.',
      analogy:
        'Un túnel que sale de tu edificio hacia un almacén desconocido donde no tenemos cámaras de seguridad.',
      diagram: ['  [App]/node_modules/mi-lib ──▶ 📁 C:\\otra-carpeta-externa (Sin vigilancia Git)'],
      whyItMattersForAgents: [
        'Banyan no podrá avisarte si esa carpeta externa tiene cambios sucios o ramas desalineadas.',
      ],
      howToFix: [
        'Añade la ruta de ese repositorio a la lista "repos" de tu archivo banyan.config.json para que entre en el radar.',
      ],
    },
    MISSING_REPO: {
      id: 'MISSING_REPO',
      code: 'WARN-CONFIG-01',
      title: 'Repositorio Configurado No Encontrado (MISSING_REPO)',
      tlDr: 'Un proyecto listado en la configuración (banyan.config.json o .banyanrc.json) no existe en disco o no contiene un repositorio Git válido.',
      analogy:
        'Una dirección postal en tu libreta de contactos que ha sido demolida o renombrada; las cartas devueltas alertan de que la ubicación ya no es válida.',
      diagram: [
        '  banyan.config.json: { "path": "./mi-proyecto" } ──▶ ❌ [Ruta inexistente en disco]',
      ],
      whyItMattersForAgents: [
        'Los agentes IA y Banyan no pueden monitorear dependencias, branches ni worktrees de un repositorio que ha sido movido, renombrado o borrado.',
      ],
      howToFix: [
        'Abre la configuración con "bny --config" y corrige la ruta del repositorio para que apunte a la carpeta real del proyecto en disco.',
      ],
    },
  },
  en: {
    concepts: {
      id: 'concepts',
      code: 'DOC-01',
      title: 'Worktrees + Node Modules + Junctions: The Big Picture',
      tlDr: 'Git isolates your code into separate folders (worktrees), but symbolic links (junctions) inside node_modules act as secret tunnels connecting those folders underneath.',
      analogy:
        'Think of each Worktree as a separate apartment so an AI Agent can work without disturbing others. However, to save disk space or test local libraries, you open "magic portals" (Junctions) connecting every apartment kitchen to the same central pantry.',
      diagram: [
        '  [Worktree A: App Login] ───────(junction @scope/common)───────▶',
        '                                                                 ▼',
        '                                              [ Shared Library Worktree ]',
        '                                                                 ▲',
        '  [Worktree B: App Experiment] ──(junction @scope/common)───────▶',
      ],
      whyItMattersForAgents: [
        'When coding solo, you remember which folder points where.',
        'With 3 AI agents (Claude Code, Aider, Cursor) running in parallel, one agent modifying a shared library can silently break another agent build.',
      ],
      howToFix: [
        'Use Tab [2] Junctions to audit active portals.',
        'Check Tab [3] Health before spawning parallel agent sessions.',
      ],
    },
    junctions: {
      id: 'junctions',
      code: 'DOC-02',
      title: 'What is an NTFS Junction / Package Symlink?',
      tlDr: 'An OS-level directory shortcut inside node_modules/@scope/pkg pointing directly to another folder on your drive containing that library source code.',
      analogy:
        'Instead of publishing your library to npm after every single keystroke, you open a portal so your main app reads the library live from disk.',
      diagram: [
        '  web-app/node_modules/@acme/common ──(Junction Portal)──▶ C:\\projects\\acme-common',
      ],
      whyItMattersForAgents: [
        'Agents rarely realize a folder inside node_modules is actually another live Git repository.',
        'If the target library switches branches or fails to build, every connected worktree breaks simultaneously.',
      ],
      howToFix: [
        'Create a dedicated library worktree for each major feature and link it via mklink /J (Windows) or ln -s (Linux/macOS).',
      ],
    },
    'shared-nm': {
      id: 'shared-nm',
      code: 'DOC-03',
      title: 'Shared Root node_modules (Badge 🔗nm vs own)',
      tlDr: 'Indicates that the ENTIRE node_modules folder of a worktree is a junction pointing to another worktree node_modules to save gigabytes of disk space.',
      analogy:
        'Like two cars sharing the exact same physical engine through a dimensional cable. If a mechanic removes a spark plug in Car B, Car A stops running.',
      diagram: [
        '  [Secondary Worktree] /node_modules (🔗nm) ──(Root Junction)──▶ [Main Worktree] /node_modules (own)',
      ],
      whyItMattersForAgents: [
        'If an agent in the secondary worktree runs "npm install" or "npm uninstall", it mutates the main worktree dependencies.',
      ],
      howToFix: [
        'If an agent needs to modify package.json dependencies, give it an isolated "own" node_modules folder.',
      ],
    },
    agents: {
      id: 'agents',
      code: 'DOC-04',
      title: 'Active Agent Radar ([🤖 AGENT])',
      tlDr: 'Banyan detects in real time whether a human or AI Agent is actively operating inside a worktree.',
      analogy: 'An infrared motion sensor installed in every branch of your repository.',
      diagram: [
        '  Signal 1: Git lock (.git/index.lock present)',
        '  Signal 2: Agent session files (.aider*, .claude*, .cursor.lock)',
        '  Signal 3: Filesystem Heartbeat (files modified within last 45s)',
        '  Signal 4: Active terminal pane in psmux (Windows) or tmux (Linux)',
      ],
      whyItMattersForAgents: [
        'Prevents you from deleting, switching branches, or relinking a worktree while an agent is actively writing code.',
      ],
      howToFix: ['Wait until the [🤖 AGENT] badge clears before removing or relinking a worktree.'],
    },
    MULTI_CONSUMER_DIRTY: {
      id: 'MULTI_CONSUMER_DIRTY',
      code: 'ERR-COLLISION-01',
      title: 'Cross-Contamination (MULTI_CONSUMER_DIRTY)',
      tlDr: 'Two or more worktrees consume the same local library worktree, and that library has uncommitted changes or an active agent modifying it.',
      analogy:
        'Two chefs cooking different dishes in the exact same frying pan at the same time while one secretly adds chili pepper.',
      diagram: [
        '  [Agent 1: Stable App]     ──(consumes)──▶',
        '                                           ▼',
        '                            [ Common Lib: ⚠️ 4 dirty files / 🤖 Agent ]',
        '                                           ▲',
        '  [Agent 2: Experiment App] ──(consumes)──▶',
      ],
      whyItMattersForAgents: [
        'Agent 1 will experience phantom build errors caused by Agent 2 live edits and waste tokens trying to fix code it did not break.',
      ],
      howToFix: [
        'Press [f] to create a clean isolated worktree on the library active branch and automatically relink the consumers to it.',
        'Or commit / stash the uncommitted changes in the shared library if all consumers should use it.',
      ],
    },
    BRANCH_MISMATCH: {
      id: 'BRANCH_MISMATCH',
      code: 'WARN-COLLISION-02',
      title: 'Branch Mismatch Mirage (BRANCH_MISMATCH)',
      tlDr: 'Your worktree is on branch "X", its link points to branch "Y", YET Banyan found a sibling worktree of that library on branch "X" that you forgot to link!',
      analogy:
        'You bought a new TV remote for the living room, but it is still paired via Bluetooth to the bedroom TV. You press buttons thinking it is broken, while changing channels in another room.',
      diagram: [
        '  [App (branch: feat-login)]',
        '       (What you think happens) ──▶ [common (branch: feat-login)] (Exists on disk, ignored)',
        '       (Actual reality ⚠️)      ──▶ [common (branch: develop)]',
      ],
      whyItMattersForAgents: [
        'This rule only fires when a sibling worktree of the dependency with the exact same branch name exists on disk (heuristic: same branch name = intended feature pair).',
        'The agent edits "common (feat-login)", builds "App (feat-login)", and sees zero changes take effect — looping endlessly.',
      ],
      howToFix: [
        'Press [f] (or copy with [y]) to rewire the symlink, junction, or manifest to the matching sibling worktree.',
      ],
    },
    BROKEN_LINK: {
      id: 'BROKEN_LINK',
      code: 'ERR-COLLISION-03',
      title: 'Ghost Portal / Broken Link (BROKEN_LINK)',
      tlDr: 'A package inside node_modules is a junction pointing to a directory that no longer exists on disk.',
      analogy: 'A doorway opening into thin air because the adjacent building was demolished.',
      diagram: ['  [App]/node_modules/@scope/pkg ──(Junction)──▶ ✖ C:\\deleted\\path (Missing)'],
      whyItMattersForAgents: [
        'Builds, tests, and linters run by the agent will immediately crash with ENOENT errors.',
      ],
      howToFix: [
        'Remove the orphaned junction using the suggested command or relink it to a valid worktree.',
      ],
    },
    SHARED_ENV_DIRTY: {
      id: 'SHARED_ENV_DIRTY',
      code: 'WARN-COLLISION-05',
      title: 'Dirty Shared Root Environment (SHARED_ENV_DIRTY)',
      tlDr: 'A worktree sharing its root environment (node_modules, .venv, etc.) has uncommitted dependency modifications that affect sibling worktrees.',
      analogy:
        'Roommates sharing a single communal refrigerator. If someone spoils the milk or alters groceries, everyone gets impacted when preparing their meal.',
      diagram: [
        '  [Secondary Worktree] (🔗nm shared) ──▶ [Main Worktree] (dirty node_modules ⚠️)',
        '                                              ▲',
        '  [Tertiary Worktree]  (🔗nm shared) ─────────┘',
      ],
      whyItMattersForAgents: [
        'Packages installed or modified by an agent in one worktree immediately contaminate dependency resolution across all other agents.',
      ],
      howToFix: [
        'Isolate the worktree environment by giving it its own independent node_modules/.venv ("own"), or clean up dependencies.',
      ],
    },
    EXTERNAL_TARGET: {
      id: 'EXTERNAL_TARGET',
      code: 'WARN-COLLISION-04',
      title: 'Unmonitored External Target (EXTERNAL_TARGET)',
      tlDr: 'A node_modules package points to a valid folder on disk, but that folder is outside the repositories monitored by Banyan.',
      analogy: 'A tunnel leading to an external warehouse with no security cameras.',
      diagram: ['  [App]/node_modules/my-lib ──▶ 📁 C:\\external-folder (Untracked by Banyan)'],
      whyItMattersForAgents: [
        'Banyan cannot warn you if that external folder has uncommitted changes or branch mismatches.',
      ],
      howToFix: ['Add that repository path to your banyan.config.json "repos" list.'],
    },
    MISSING_REPO: {
      id: 'MISSING_REPO',
      code: 'WARN-CONFIG-01',
      title: 'Missing Configured Repository (MISSING_REPO)',
      tlDr: 'A project declared in your configuration (banyan.config.json or .banyanrc.json) does not exist on disk or is not a valid Git repository.',
      analogy:
        'A postal address in your address book that was demolished or renamed; returned mail alerts you that the location is obsolete.',
      diagram: ['  banyan.config.json: { "path": "./my-project" } ──▶ ❌ [Nonexistent disk path]'],
      whyItMattersForAgents: [
        'AI agents and Banyan cannot inspect dependencies, branches, or worktrees of a repository that has been moved, renamed, or deleted.',
      ],
      howToFix: [
        'Open your configuration using "bny --config" and update the repository path to point to the correct directory on disk.',
      ],
    },
  },
}
