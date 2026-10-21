# Contributing to Banyan 🌳

Thank you for your interest in contributing to **Banyan**!

## Development Setup

```bash
git clone https://github.com/csarlu/banyan.git
cd banyan
npm install
npm run check
```

- `npm test`: Runs unit tests and real Git worktree sandbox integration tests via Vitest.
- `npm run typecheck`: Runs TypeScript strict type verification (`tsc --noEmit`).
- `npm run build`: Bundles the ESM CLI via `tsup`.
- `npm run check`: Runs all three steps in sequence.

### CI

GitHub Actions is off for this repo: the workflows only run when launched by hand. The check on a commit comes from `npm run ci:act`, which runs `.github/workflows/ci.yml` itself with [act](https://github.com/nektos/act) in Linux containers, on a clean clone of `HEAD`, and posts the result to the commit as the status `ci/act (ci.yml)`.

- Run it before pushing; once the commit is on GitHub, `npm run ci:act -- --report` posts the kept result.
- act only runs Linux: it covers the Ubuntu jobs (Node 20 and 22). The Windows and macOS jobs of the matrix only run on GitHub.
- It needs `act`, Docker and a logged-in `gh`. Results and logs stay in `.git/ci-act/`.

## How to Add a New `EcosystemAdapter`

Banyan uses a static, zero-binary-spawning adapter architecture in `src/core/adapters/` to maintain 60 FPS TUI responsiveness:

1. **Create your adapter** in `src/core/adapters/<lang>Adapter.ts` implementing the `EcosystemAdapter` interface (`src/core/adapters/types.ts`):
   - `detect(worktreePath)`: Fast `fs.access` check for manifest files (e.g., `pom.xml`, `composer.json`, `Gemfile`).
   - `inspectSharedEnv(worktreePath, allWorktrees)`: Check if build/vendor folders are symlinked across worktrees.
   - `scanLinks(worktree, allWorktrees, config)`: Parse local path dependencies using `fs.promises.readFile` and resolve them with `resolvePathToWorktree`.
   - `buildFixCommand(link, newTargetWorktree)`: Return the exact CLI command to relink to a branch-aligned sibling worktree.
2. **Register the adapter** in `LANGUAGE_ADAPTERS` inside `src/core/adapters/index.ts` and add its `EcosystemId` to `src/core/types.ts`.
3. **Add unit and sandbox tests** in `tests/polyglot.test.ts` and run `npm run check`.
## How to Add a New Language

User-facing text lives in `src/i18n/`:

- `index.ts` — TUI dictionaries (`DICTIONARIES`) and `detectDefaultLocale`.
- `messages.ts` — headless/runtime messages (`MESSAGES`), `localizeWarningMessage`.

1. Add the locale code to `Locale` (`src/i18n/index.ts`) and to the zod `LocaleEnum` in `src/core/config.ts`.
2. Add a full translation to `DICTIONARIES` and `MESSAGES`; `tests/i18n.test.ts` fails if any key is missing relative to English.
3. Collision warnings keep an English canonical `message` plus a translation field (`messageEs`); add the equivalent for your locale in `src/core/collisions.ts`.
4. Translate the help text in `src/cli.tsx`, the `src/docs/` content and the playground README, then run `npm run check`.