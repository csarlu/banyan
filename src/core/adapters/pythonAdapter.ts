import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { JunctionLink, SharedEnvInfo, WorkspaceConfig, WorktreeNode } from '../types.js'
import { buildFileReplaceCommand, commentSafe, quoteArg } from '../shellSafe.js'
import {
  computeTargetSubpath,
  EcosystemAdapter,
  inspectFolderSharedEnv,
  pathExists,
  resolveNewTargetPath,
  resolvePathToWorktree,
  resolveReplacementStrings,
} from './types.js'

export interface ParsedPythonLink {
  packageName: string
  targetPath: string
}

export function parsePythonDirectUrl(
  rawJson: string,
  distInfoDirName: string,
): ParsedPythonLink | null {
  try {
    const data = JSON.parse(rawJson)
    if (!data?.dir_info?.editable || typeof data.url !== 'string') {
      return null
    }
    let targetPath = data.url
    if (targetPath.startsWith('file://')) {
      try {
        targetPath = fileURLToPath(targetPath)
      } catch {
        targetPath = targetPath.replace(/^file:\/\/\/?/, '')
      }
    }
    const pkgName = distInfoDirName.replace(/-[0-9].*\.dist-info$/, '').replace(/\.dist-info$/, '')
    return {
      packageName: pkgName || distInfoDirName,
      targetPath,
    }
  } catch {
    return null
  }
}

export function parsePythonPth(content: string, pthFileName: string): ParsedPythonLink[] {
  const results: ParsedPythonLink[] = []
  const baseName = pthFileName
    .replace(/^__editable__\./, '')
    .replace(/-[0-9].*\.pth$/, '')
    .replace(/\.pth$/, '')

  const lines = content.split(/\r?\n/)
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('import ')) {
      // Editable hooks sometimes embed path literals in import lines
      const strMatch = line.match(/['"]([^'"]+(?:\/|\\)[^'"]+)['"]/)
      if (strMatch) {
        results.push({ packageName: baseName, targetPath: strMatch[1] })
      }
      continue
    }
    results.push({ packageName: baseName, targetPath: line })
  }
  return results
}

export function parsePythonSysPath(pyContent: string): string[] {
  const paths: string[] = []
  const lines = pyContent.split(/\r?\n/)
  const regex = /sys\.path\.(?:append|insert)\s*\(.*?['"]([^'"]+)['"]/g
  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue
    let match: RegExpExecArray | null
    regex.lastIndex = 0
    while ((match = regex.exec(line)) !== null) {
      if (match[1]) {
        paths.push(match[1].trim())
      }
    }
  }
  return paths
}

export function parseEnvPythonPath(envContent: string): string[] {
  const paths: string[] = []
  const lines = envContent.split(/\r?\n/)
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^(?:export\s+)?PYTHONPATH\s*=\s*(.+)$/)
    if (match) {
      let val = match[1].trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      const parts = val
        .split(/[:;]/)
        .map((p) => p.trim())
        .filter((p) => p && !p.startsWith('$') && !p.startsWith('%'))
      paths.push(...parts)
    }
  }
  return paths
}

async function findSitePackagesDirs(worktreePath: string): Promise<string[]> {
  const dirs: string[] = []
  for (const venvName of ['.venv', 'venv']) {
    const venvRoot = path.join(worktreePath, venvName)
    if (!(await pathExists(venvRoot))) continue

    // Windows layout: .venv/Lib/site-packages
    const winSp = path.join(venvRoot, 'Lib', 'site-packages')
    if (await pathExists(winSp)) {
      dirs.push(winSp)
    }

    // POSIX layout: .venv/lib/pythonX.Y/site-packages
    const posixLib = path.join(venvRoot, 'lib')
    if (await pathExists(posixLib)) {
      try {
        const entries = await fs.readdir(posixLib, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isDirectory() && entry.name.startsWith('python')) {
            const sp = path.join(posixLib, entry.name, 'site-packages')
            if (await pathExists(sp)) {
              dirs.push(sp)
            }
          }
        }
      } catch {
        // Ignore read errors
      }
    }
  }
  return dirs
}

async function createResolvedPythonLink(
  worktree: WorktreeNode,
  packageName: string,
  linkPath: string,
  rawTargetPath: string,
  mechanism: 'pip-editable' | 'pythonpath-override',
  manifestFile: string,
  allWorktrees: WorktreeNode[],
): Promise<JunctionLink | null> {
  const resolvedTarget = path.resolve(worktree.worktreePath, rawTargetPath)
  const normSelf = path.resolve(worktree.worktreePath).toLowerCase()
  const normTarget = resolvedTarget.toLowerCase()

  // Ignore paths pointing inside the same worktree
  if (normTarget === normSelf || normTarget.startsWith(normSelf + path.sep)) {
    return null
  }

  const exists = await pathExists(resolvedTarget)
  let targetRealPath = resolvedTarget
  if (exists) {
    try {
      targetRealPath = await fs.realpath(resolvedTarget)
    } catch {
      targetRealPath = resolvedTarget
    }
  }

  const matchedWorktree = exists
    ? resolvePathToWorktree(targetRealPath, allWorktrees)
    : resolvePathToWorktree(resolvedTarget, allWorktrees)

  return {
    sourceWorktreeId: worktree.id,
    sourceWorktreePath: worktree.worktreePath,
    packageName,
    linkPath,
    targetRealPath,
    rawTarget: rawTargetPath,
    targetSubpath: computeTargetSubpath(exists ? targetRealPath : resolvedTarget, matchedWorktree),
    targetWorktreeId: matchedWorktree?.id,
    targetRepoAlias: matchedWorktree?.repoAlias,
    targetBranch: matchedWorktree?.branch,
    isBroken: !exists,
    isHighlightedScope: true,
    ecosystem: 'python',
    mechanism,
    manifestFile,
  }
}

async function hasPythonFilesTopLevels(worktreePath: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(worktreePath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.py')) return true
      if (
        entry.isDirectory() &&
        !entry.name.startsWith('.') &&
        !['node_modules', 'venv', 'target', 'dist', 'build'].includes(entry.name)
      ) {
        try {
          const subEntries = await fs.readdir(path.join(worktreePath, entry.name), {
            withFileTypes: true,
          })
          if (subEntries.some((se) => se.isFile() && se.name.endsWith('.py'))) {
            return true
          }
        } catch {
          // Ignore
        }
      }
    }
  } catch {
    // Ignore
  }
  return false
}

export async function scanPythonRawImports(
  worktree: WorktreeNode,
  allWorktrees: WorktreeNode[],
): Promise<JunctionLink[]> {
  const links: JunctionLink[] = []
  const wtPath = worktree.worktreePath

  // 1. Check .env / .envrc for PYTHONPATH=...
  for (const envName of ['.env', '.envrc']) {
    const envPath = path.join(wtPath, envName)
    if (await pathExists(envPath)) {
      try {
        const content = await fs.readFile(envPath, 'utf-8')
        const pyPaths = parseEnvPythonPath(content)
        for (const rawTarget of pyPaths) {
          const pkgName = path.basename(path.resolve(wtPath, rawTarget)) || rawTarget
          const link = await createResolvedPythonLink(
            worktree,
            pkgName,
            envPath,
            rawTarget,
            'pythonpath-override',
            envName,
            allWorktrees,
          )
          if (link) links.push(link)
        }
      } catch {
        // Ignore read error
      }
    }
  }

  // 2. Check .vscode/settings.json for python.analysis.extraPaths
  const vscodeSettingsPath = path.join(wtPath, '.vscode', 'settings.json')
  if (await pathExists(vscodeSettingsPath)) {
    try {
      const content = await fs.readFile(vscodeSettingsPath, 'utf-8')
      const cleaned = content.replace(/^\s*\/\/.*$/gm, '')
      const parsed = JSON.parse(cleaned)
      const extraPaths =
        parsed['python.analysis.extraPaths'] || parsed['python.autoComplete.extraPaths']
      if (Array.isArray(extraPaths)) {
        for (const rawTarget of extraPaths) {
          if (typeof rawTarget === 'string') {
            const pkgName = path.basename(path.resolve(wtPath, rawTarget)) || rawTarget
            const link = await createResolvedPythonLink(
              worktree,
              pkgName,
              vscodeSettingsPath,
              rawTarget,
              'pythonpath-override',
              '.vscode/settings.json',
              allWorktrees,
            )
            if (link) links.push(link)
          }
        }
      }
    } catch {
      // Ignore invalid JSON
    }
  }

  // 3. Scan top 2 levels of .py files for sys.path.append / sys.path.insert
  const pyFiles: { fullPath: string; relName: string }[] = []
  try {
    const entries = await fs.readdir(wtPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.py')) {
        pyFiles.push({ fullPath: path.join(wtPath, entry.name), relName: entry.name })
      } else if (
        entry.isDirectory() &&
        !entry.name.startsWith('.') &&
        !['node_modules', 'venv', 'target', 'dist', 'build', '__pycache__'].includes(entry.name)
      ) {
        try {
          const subEntries = await fs.readdir(path.join(wtPath, entry.name), {
            withFileTypes: true,
          })
          for (const sub of subEntries) {
            if (sub.isFile() && sub.name.endsWith('.py')) {
              pyFiles.push({
                fullPath: path.join(wtPath, entry.name, sub.name),
                relName: `${entry.name}/${sub.name}`,
              })
            }
          }
        } catch {
          // Ignore
        }
      }
    }
  } catch {
    // Ignore
  }

  for (const pyFile of pyFiles) {
    try {
      const content = await fs.readFile(pyFile.fullPath, 'utf-8')
      const rawPaths = parsePythonSysPath(content)
      for (const rawTarget of rawPaths) {
        const baseDir = path.dirname(pyFile.fullPath)
        const absTarget = path.resolve(baseDir, rawTarget)
        const relFromWt = path.relative(wtPath, absTarget)
        const pkgName = path.basename(absTarget) || rawTarget
        const link = await createResolvedPythonLink(
          worktree,
          pkgName,
          pyFile.fullPath,
          relFromWt,
          'pythonpath-override',
          pyFile.relName,
          allWorktrees,
        )
        if (link) links.push(link)
      }
    } catch {
      // Ignore
    }
  }

  return links
}

export const pythonAdapter: EcosystemAdapter = {
  id: 'python',
  label: 'Py',

  async detect(worktreePath: string): Promise<boolean> {
    if (
      (await pathExists(path.join(worktreePath, 'pyproject.toml'))) ||
      (await pathExists(path.join(worktreePath, 'requirements.txt'))) ||
      (await pathExists(path.join(worktreePath, 'setup.py'))) ||
      (await pathExists(path.join(worktreePath, '.venv'))) ||
      (await pathExists(path.join(worktreePath, 'venv')))
    ) {
      return true
    }
    return hasPythonFilesTopLevels(worktreePath)
  },

  async inspectSharedEnv(
    worktreePath: string,
    allWorktrees: WorktreeNode[] = [],
  ): Promise<SharedEnvInfo | null> {
    if (!(await this.detect(worktreePath))) return null
    return inspectFolderSharedEnv(worktreePath, 'python', ['.venv', 'venv'], '.venv', allWorktrees)
  },

  async scanLinks(
    worktree: WorktreeNode,
    allWorktrees: WorktreeNode[],
    config: WorkspaceConfig,
  ): Promise<JunctionLink[]> {
    if (config.adapters?.python?.enabled === false) return []

    const links: JunctionLink[] = []
    const seenKeys = new Set<string>()
    const addLink = (l: JunctionLink | null) => {
      if (!l) return
      const key = `${l.packageName}::${path.resolve(l.targetRealPath).toLowerCase()}`
      if (!seenKeys.has(key)) {
        seenKeys.add(key)
        links.push(l)
      }
    }

    const spDirs = await findSitePackagesDirs(worktree.worktreePath)
    for (const spDir of spDirs) {
      let entries: import('node:fs').Dirent[] = []
      try {
        entries = await fs.readdir(spDir, { withFileTypes: true })
      } catch {
        continue
      }

      for (const entry of entries) {
        const entryFullPath = path.join(spDir, entry.name)
        const relManifest = path.relative(worktree.worktreePath, entryFullPath).replace(/\\/g, '/')

        // (a) Direct symlink / junction inside site-packages
        try {
          const st = await fs.lstat(entryFullPath)
          if (st.isSymbolicLink()) {
            let targetRealPath = ''
            try {
              targetRealPath = await fs.realpath(entryFullPath)
            } catch {
              targetRealPath = await fs.readlink(entryFullPath).catch(() => entryFullPath)
            }
            const link = await createResolvedPythonLink(
              worktree,
              entry.name,
              entryFullPath,
              targetRealPath,
              'pip-editable',
              relManifest,
              allWorktrees,
            )
            addLink(link)
            continue
          }
        } catch {
          // Continue
        }

        // (b) *.egg-link files (first line = target path)
        if (entry.isFile() && entry.name.endsWith('.egg-link')) {
          try {
            const content = await fs.readFile(entryFullPath, 'utf-8')
            const firstLine = content.split(/\r?\n/)[0]?.trim()
            if (firstLine) {
              const pkgName = entry.name.replace(/\.egg-link$/, '')
              const link = await createResolvedPythonLink(
                worktree,
                pkgName,
                entryFullPath,
                firstLine,
                'pip-editable',
                relManifest,
                allWorktrees,
              )
              addLink(link)
            }
          } catch {
            // Ignore
          }
        }

        // (c) *.pth files
        if (entry.isFile() && entry.name.endsWith('.pth')) {
          try {
            const content = await fs.readFile(entryFullPath, 'utf-8')
            const parsedList = parsePythonPth(content, entry.name)
            for (const p of parsedList) {
              const link = await createResolvedPythonLink(
                worktree,
                p.packageName,
                entryFullPath,
                p.targetPath,
                'pip-editable',
                relManifest,
                allWorktrees,
              )
              addLink(link)
            }
          } catch {
            // Ignore
          }
        }

        // (d) *.dist-info/direct_url.json (PEP 610 editable installs)
        if (entry.isDirectory() && entry.name.endsWith('.dist-info')) {
          const directUrlPath = path.join(entryFullPath, 'direct_url.json')
          if (await pathExists(directUrlPath)) {
            try {
              const rawJson = await fs.readFile(directUrlPath, 'utf-8')
              const parsed = parsePythonDirectUrl(rawJson, entry.name)
              if (parsed) {
                const relDirect = path
                  .relative(worktree.worktreePath, directUrlPath)
                  .replace(/\\/g, '/')
                const link = await createResolvedPythonLink(
                  worktree,
                  parsed.packageName,
                  directUrlPath,
                  parsed.targetPath,
                  'pip-editable',
                  relDirect,
                  allWorktrees,
                )
                addLink(link)
              }
            } catch {
              // Ignore
            }
          }
        }
      }
    }

    // Also scan zero-config / raw Python imports (.env PYTHONPATH, sys.path.append)
    const rawLinks = await scanPythonRawImports(worktree, allWorktrees)
    for (const rl of rawLinks) {
      addLink(rl)
    }

    return links
  },

  buildFixCommand(link: JunctionLink, newTargetWorktree: WorktreeNode): string {
    const newTarget = resolveNewTargetPath(link, newTargetWorktree)
    const manifestOrLink = (link.manifestFile || link.linkPath || '').replace(/\\/g, '/')

    if (link.mechanism === 'pythonpath-override') {
      const isEnvOrSettings =
        manifestOrLink === '.env' ||
        manifestOrLink === '.envrc' ||
        manifestOrLink === '.vscode/settings.json' ||
        manifestOrLink.endsWith('/.env') ||
        manifestOrLink.endsWith('/.envrc') ||
        manifestOrLink.endsWith('/.vscode/settings.json')

      if (isEnvOrSettings) {
        const targetFile = link.linkPath || link.manifestFile || '.env'
        const { oldStr, newStr } = resolveReplacementStrings(link, newTargetWorktree)
        const fallback = `Update PYTHONPATH / extraPaths in "${link.manifestFile || link.linkPath}" to "${newTarget}"`
        return buildFileReplaceCommand(targetFile, oldStr, newStr, fallback)
      }

      return `# Update PYTHONPATH / sys.path in "${commentSafe(link.manifestFile || link.linkPath)}" to "${commentSafe(newTarget)}"`
    }

    if (manifestOrLink.endsWith('.pth') || manifestOrLink.endsWith('.egg-link')) {
      const targetFile = link.linkPath || link.manifestFile || ''
      const { oldStr, newStr } = resolveReplacementStrings(link, newTargetWorktree)
      const fallback = `Update "${link.manifestFile || link.linkPath}" to "${newTarget}"`
      return buildFileReplaceCommand(targetFile, oldStr, newStr, fallback)
    }

    const venvDirName =
      manifestOrLink.startsWith('venv/') || manifestOrLink.includes('/venv/') ? 'venv' : '.venv'
    const useWin =
      (link.sourceWorktreePath && link.sourceWorktreePath.includes('\\')) ||
      (!link.sourceWorktreePath && process.platform === 'win32')
    const relBin =
      process.platform === 'win32'
        ? useWin
          ? `${venvDirName}\\Scripts\\python.exe`
          : `${venvDirName}/Scripts/python.exe`
        : `${venvDirName}/bin/python`
    const pythonBin = link.sourceWorktreePath
      ? useWin
        ? path.win32.join(link.sourceWorktreePath, relBin.replace(/\//g, '\\'))
        : path.posix.join(link.sourceWorktreePath, relBin.replace(/\\/g, '/'))
      : relBin

    return `${quoteArg(pythonBin)} -m pip install -e ${quoteArg(newTarget)}`
  },
}
