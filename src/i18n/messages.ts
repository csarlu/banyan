import type { Locale } from './index.js'
import type { CollisionWarning } from '../core/types.js'

/**
 * Returns the warning message in the requested locale.
 * The canonical `message` is English; Spanish lives in `messageEs`.
 */
export function localizeWarningMessage(
  warn: Pick<CollisionWarning, 'message' | 'messageEs'>,
  locale: Locale,
): string {
  return locale === 'es' ? (warn.messageEs ?? warn.message) : warn.message
}

/** Runtime messages for headless commands (non-TUI): status, CLI feedback, confirm modal, briefing. */
export const MESSAGES = {
  en: {
    status: {
      subtitle: 'Polyglot Worktree & Dependency Control Plane',
      worktrees: 'ACTIVE WORKTREES',
      noWorktrees: 'No worktrees detected in this workspace.',
      links: 'LOCAL LINKS & JUNCTIONS',
      noLinks: 'No active package symlinks.',
      broken: 'BROKEN',
      localPackage: 'LOCAL PACKAGE',
      external: 'EXTERNAL',
      health: 'HEALTH & COLLISIONS',
      healthy: 'Ecosystem 100% healthy and isolated.',
      critical: 'CRITICAL',
      warning: 'WARNING',
      fix: 'Fix',
    },
    cli: {
      editorError: (editor: string, err: string) => `❌ Failed to open editor (${editor}): ${err}`,
      configEdited: (file: string, editor: string) =>
        `✔ Configuration edited (${file}) using ${editor}`,
      rulesAdded: (file: string) => `✔ Banyan rules added to ${file}`,
      rulesPresent: (file: string) => `ℹ️ ${file} already contains the Banyan rules.`,
      playgroundCreating: '🌱 Creating Banyan Polyglot Playground on disk...',
      playgroundReady: (dir: string) => `✔ Playground initialized at: ${dir}`,
      playgroundEcosystems: '✔ Ecosystems ready: Node, Python, Go, Rust, .NET, Raw',
      playgroundDone: (dir: string) =>
        `\n✨ Playground session finished.\n` +
        `Directory preserved for inspection: ${dir}\n` +
        `💡 Tip: Run 'bny --clean-playground' to remove playgrounds, or 'bny -p --rm' for ephemeral sessions.\n`,
      playgroundCleaned: (count: number) =>
        `✔ Cleaned ${count} polyglot playground ${count === 1 ? 'directory' : 'directories'}.`,
      playgroundNoneFound: 'ℹ️ No active polyglot playground directories found to clean.',
      playgroundAutoCleaned: (dir: string) =>
        `\n✨ Ephemeral playground session finished.\n✔ Cleaned temporary directory: ${dir}\n`,
      guardOk: '✅ Banyan Guard: Worktree isolated and healthy.',
      gitMissing: (hint: string) =>
        `❌ git was not found on your PATH.\n` +
        `   Banyan needs git to read worktrees, branches and status; without it every report would be empty.\n` +
        `   Install it: ${hint}\n` +
        `   Run "bny --doctor" to review every requirement.`,
    },
    confirm: {
      press: 'Press',
      toConfirm: 'to confirm or',
      toCancel: 'to cancel.',
      confirmKeys: '[Enter / Y]',
      cancelKeys: '[Esc / N]',
    },
    briefing: {
      pythonShared: (env: string, target: string) =>
        `- 🛑 **DO NOT run \`pip install\` or \`uv add\`:** This environment \`${env}\` is shared with \`[${target}]\`. Modifying packages here will contaminate the other worktree.`,
      rustShared: (env: string, target: string) =>
        `- ⚠️ **CAUTION: Folder \`${env}/\` shared with \`[${target}]\`:** Running \`cargo build\` or \`cargo test\` simultaneously with another agent will lock the build directory or corrupt incremental artifacts.`,
      dotnetShared: (env: string, target: string) =>
        `- ⚠️ **CAUTION: Folder \`${env}/\` (.NET) shared with \`[${target}]\`:** Running \`dotnet build\` simultaneously will corrupt intermediate artifacts.`,
    },
  },
  es: {
    status: {
      subtitle: 'Plano de Control Políglota de Worktrees y Dependencias',
      worktrees: 'WORKTREES ACTIVOS',
      noWorktrees: 'No se detectaron worktrees en este workspace.',
      links: 'ENLACES LOCALES & JUNCTIONS',
      noLinks: 'Sin enlaces simbólicos de paquetes activos.',
      broken: 'ROTO',
      localPackage: 'PAQUETE LOCAL',
      external: 'EXTERNO',
      health: 'SALUD & COLISIONES',
      healthy: 'Ecosistema 100% saludable y aislado.',
      critical: 'CRÍTICO',
      warning: 'AVISO',
      fix: 'Fix',
    },
    cli: {
      editorError: (editor: string, err: string) => `❌ Error al abrir editor (${editor}): ${err}`,
      configEdited: (file: string, editor: string) =>
        `✔ Configuración editada (${file}) usando ${editor}`,
      rulesAdded: (file: string) => `✔ Reglas de Banyan añadidas a ${file}`,
      rulesPresent: (file: string) => `ℹ️ ${file} ya contiene las reglas de Banyan.`,
      playgroundCreating: '🌱 Creando Banyan Polyglot Playground en disco...',
      playgroundReady: (dir: string) => `✔ Playground inicializado en: ${dir}`,
      playgroundEcosystems: '✔ Ecosistemas listos: Node, Python, Go, Rust, .NET, Raw',
      playgroundDone: (dir: string) =>
        `\n✨ Sesión de Playground finalizada.\n` +
        `Directorio preservado para inspección: ${dir}\n` +
        `💡 Consejo: Usa 'bny --clean-playground' para eliminar playgrounds, o 'bny -p --rm' para sesiones efímeras.\n`,
      playgroundCleaned: (count: number) =>
        `✔ Se ${count === 1 ? 'ha eliminado' : 'han eliminado'} ${count} ${count === 1 ? 'directorio' : 'directorios'} de playground políglota.`,
      playgroundNoneFound: 'ℹ️ No se encontraron directorios de playground políglota para limpiar.',
      playgroundAutoCleaned: (dir: string) =>
        `\n✨ Sesión de Playground efímera finalizada.\n✔ Directorio temporal eliminado: ${dir}\n`,
      guardOk: '✅ Banyan Guard: Worktree aislado y saludable.',
      gitMissing: (hint: string) =>
        `❌ No se encontró git en el PATH.\n` +
        `   Banyan necesita git para leer worktrees, ramas y estado; sin él todos los informes saldrían vacíos.\n` +
        `   Instálalo: ${hint}\n` +
        `   Ejecuta "bny --doctor" para revisar todos los requisitos.`,
    },
    confirm: {
      press: 'Pulsa',
      toConfirm: 'para confirmar o',
      toCancel: 'para cancelar.',
      confirmKeys: '[Enter / S]',
      cancelKeys: '[Esc / N]',
    },
    briefing: {
      pythonShared: (env: string, target: string) =>
        `- 🛑 **PROHIBIDO ejecutar \`pip install\` o \`uv add\`:** Este entorno \`${env}\` es compartido con \`[${target}]\`. Modificar paquetes aquí contaminará el otro worktree.`,
      rustShared: (env: string, target: string) =>
        `- ⚠️ **CUIDADO: Carpeta \`${env}/\` compartida con \`[${target}]\`:** Ejecutar \`cargo build\` o \`cargo test\` simultáneamente con otro agente bloqueará el directorio de compilación o corromperá artefactos incrementales.`,
      dotnetShared: (env: string, target: string) =>
        `- ⚠️ **CUIDADO: Carpeta \`${env}/\` (.NET) compartida con \`[${target}]\`:** Ejecutar \`dotnet build\` simultáneamente corromperá los artefactos intermedios.`,
    },
  },
} as const

export function getMessages(locale: Locale) {
  return MESSAGES[locale] ?? MESSAGES.en
}
