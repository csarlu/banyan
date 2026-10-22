import fs from 'node:fs'

/**
 * Single source of truth for the displayed version. Both the bundled `dist/cli.js` and the
 * sources under `src/` sit one level below the package root, and npm always ships package.json.
 */
function readPackageVersion(): string {
  try {
    const pkgUrl = new URL('../package.json', import.meta.url)
    const pkg = JSON.parse(fs.readFileSync(pkgUrl, 'utf8')) as { version?: string }
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

export const BANYAN_VERSION = readPackageVersion()
