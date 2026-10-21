#!/usr/bin/env node
/**
 * Local CI: runs this repo's GitHub workflow with act, in Linux containers, on
 * one exact commit, and reports the result to GitHub as a commit status. A
 * status is not an Actions run, so it costs no minutes.
 *
 *   npm run ci:act                 run the workflow on HEAD and keep the result;
 *                                  report it at once if the commit is on GitHub
 *   npm run ci:act -- --report     report the kept result of HEAD (after a push)
 *   npm run ci:act -- --sha <rev>  another commit
 *   npm run ci:act -- --job <id>   one job only (not reported: it is not the whole workflow)
 *
 * Only committed work is tested: the commit is checked out into a temporary
 * clone, so what passes is exactly what gets pushed. A clone, not a worktree:
 * a worktree's .git is a file pointing at a Windows path the container cannot
 * see, so anything running git inside the job would find no repository.
 *
 * Per-repo settings live in package.json under "ciAct" (all optional):
 *   workflow  file in .github/workflows              (default "ci.yml")
 *   matrix    act --matrix filters, e.g. ["os:ubuntu-latest"]
 *   secrets   names act gets from `gh auth token`, besides GITHUB_TOKEN
 *
 * Needs act, Docker and an authenticated gh. Results and logs: .git/ci-act/.
 */
import { spawn, spawnSync } from 'node:child_process'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { hostname, tmpdir } from 'node:os'
import { join } from 'node:path'

const IMAGE = 'ubuntu-latest=catthehacker/ubuntu:act-latest'
const EVENT = 'workflow_dispatch'

const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const option = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}

const run = (cmd, cmdArgs, opts = {}) => {
  const r = spawnSync(cmd, cmdArgs, { encoding: 'utf8', ...opts })
  if (r.error) throw new Error(`${cmd}: ${r.error.message}`)
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() }
}
const git = (...a) => {
  const r = run('git', a)
  if (!r.ok) throw new Error(`git ${a.join(' ')}: ${r.err}`)
  return r.out
}
const fail = (msg) => {
  console.error(`ci:act — ${msg}`)
  process.exit(1)
}

const root = git('rev-parse', '--show-toplevel')
const config = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).ciAct ?? {}
const workflow = config.workflow ?? 'ci.yml'
const sha = git('rev-parse', `${option('sha') ?? 'HEAD'}^{commit}`)
const short = sha.slice(0, 7)
const job = option('job')
const resultsDir = join(git('rev-parse', '--git-common-dir'), 'ci-act')
const resultFile = join(resultsDir, `${sha}.json`)
const logFile = join(resultsDir, `${sha}.log`)
const context = `ci/act (${workflow})`

/** owner/repo on GitHub, or null when gh cannot tell. */
function slug() {
  const r = run('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], {
    cwd: root,
  })
  return r.ok && r.out ? r.out : null
}

function onGitHub(repo) {
  return run('gh', ['api', `repos/${repo}/commits/${sha}`, '--silent']).ok
}

function report(result) {
  const repo = slug()
  if (!repo) fail('gh cannot tell which GitHub repo this is; is gh logged in?')
  if (!onGitHub(repo)) {
    console.log(
      `ci:act — ${short} is not on GitHub yet: push it, then run npm run ci:act -- --report`,
    )
    return false
  }
  const state = result.ok ? 'success' : 'failure'
  const description = `${result.ok ? 'passed' : 'failed'} in ${result.seconds}s on ${result.host} (act, Linux)`
  const r = run('gh', [
    'api',
    `repos/${repo}/statuses/${sha}`,
    '--silent',
    '-f',
    `state=${state}`,
    '-f',
    `context=${context}`,
    '-f',
    `description=${description}`,
  ])
  if (!r.ok) fail(`could not post the status: ${r.err}`)
  console.log(`ci:act — ${short} marked ${state} on ${repo} as "${context}"`)
  return true
}

if (flag('report')) {
  if (!existsSync(resultFile)) fail(`no result kept for ${short}: run npm run ci:act first`)
  const kept = JSON.parse(readFileSync(resultFile, 'utf8'))
  if (kept.job)
    fail(`the result kept for ${short} is one job (${kept.job}): run the whole workflow`)
  report(kept)
  process.exit(0)
}

for (const [tool, probe] of [
  ['act', ['--version']],
  ['docker', ['info', '--format', '{{.ServerVersion}}']],
  ['gh', ['auth', 'token']],
]) {
  const r = spawnSync(tool, probe, { encoding: 'utf8' })
  if (r.error || r.status !== 0)
    fail(`${tool} is missing or not ready (${tool} ${probe.join(' ')})`)
}
if (git('status', '--porcelain')) {
  console.warn('ci:act — uncommitted changes are not tested: only the commit is')
}

mkdirSync(resultsDir, { recursive: true })
const tree = join(tmpdir(), `ci-act-${short}-${process.pid}`)
git('clone', '--quiet', '--no-checkout', root, tree)
if (!run('git', ['-C', tree, 'checkout', '--quiet', '--detach', sha]).ok) {
  rmSync(tree, { recursive: true, force: true })
  fail(`${short} is on no branch of this repo: commit it on a branch first`)
}

const token = run('gh', ['auth', 'token']).out
const secretNames = ['GITHUB_TOKEN', ...(config.secrets ?? [])]
const actArgs = [
  EVENT,
  '-W',
  `.github/workflows/${workflow}`,
  '-P',
  IMAGE,
  '--container-architecture',
  'linux/amd64',
  // The old cache copies actions from NTFS and drops their exec bit: a cached
  // action's entrypoint.sh then fails with "Permission denied" on the second run
  '--use-new-action-cache',
  ...secretNames.flatMap((s) => ['-s', s]),
  ...(config.matrix ?? []).flatMap((m) => ['--matrix', m]),
  ...(job ? ['-j', job] : []),
]

console.log(`ci:act — ${workflow} on ${short} (${git('log', '-1', '--format=%s', sha)})`)
const started = Date.now()
const log = createWriteStream(logFile)
const code = await new Promise((resolve) => {
  const child = spawn('act', actArgs, {
    cwd: tree,
    env: { ...process.env, ...Object.fromEntries(secretNames.map((s) => [s, token])) },
  })
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => {
      process.stdout.write(chunk)
      log.write(chunk)
    })
  }
  child.on('close', resolve)
})
log.end()
rmSync(tree, { recursive: true, force: true })

const result = {
  sha,
  workflow,
  job: job ?? null,
  ok: code === 0,
  seconds: Math.round((Date.now() - started) / 1000),
  host: hostname(),
  finishedAt: new Date().toISOString(),
}
writeFileSync(resultFile, `${JSON.stringify(result, null, 2)}\n`)
console.log(`\nci:act — ${result.ok ? 'PASSED' : 'FAILED'} in ${result.seconds}s · log: ${logFile}`)

if (job) console.log('ci:act — one job only: not reported to GitHub')
else report(result)
process.exit(result.ok ? 0 : 1)
