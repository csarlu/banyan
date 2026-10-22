export type EcosystemId = 'node' | 'python' | 'go' | 'rust' | 'dotnet' | 'raw'

export type LinkMechanism =
  | 'fs-junction' // Symlink / NTFS Junction in node_modules or venv
  | 'pip-editable' // Python .pth / direct_url.json / .egg-link
  | 'go-mod-replace' // Go replace directive / go.work
  | 'cargo-path' // Rust Cargo.toml path dependency
  | 'dotnet-projref' // .NET <ProjectReference> in .csproj
  | 'source-symlink' // Symlink / NTFS junction directly in source tree
  | 'pythonpath-override' // PYTHONPATH in .env / extraPaths / sys.path.append
  | 'tsconfig-path' // TypeScript compilerOptions.paths alias to sibling worktree

export interface SharedEnvInfo {
  ecosystem: EcosystemId
  envName: string // 'node_modules' | '.venv' | 'target' | 'obj' | 'bin'
  type: 'own' | 'shared' | 'none'
  targetRealPath?: string
  targetWorktreeId?: string
}

export interface RepoConfig {
  alias: string
  path: string
}

export type ConfigThemeName =
  'default' | 'catppuccin' | 'dracula' | 'nord' | 'monokai' | 'solarized' | 'matrix'

export type ConfigLocale = 'es' | 'en'

export interface WorkspaceConfig {
  root: string
  discoverSubdirs?: boolean
  theme?: ConfigThemeName
  lang?: ConfigLocale
  repos: RepoConfig[]
  adapters?: {
    node?: {
      enabled: 'auto' | boolean
      highlightScopes?: string[]
    }
    python?: {
      enabled?: 'auto' | boolean
    }
    go?: {
      enabled?: 'auto' | boolean
    }
    rust?: {
      enabled?: 'auto' | boolean
    }
    dotnet?: {
      enabled?: 'auto' | boolean
    }
    raw?: {
      enabled?: 'auto' | boolean
    }
  }
  agentDetection?: {
    lockFiles?: string[]
    recentModifiedThresholdSec?: number
    agentCommand?: string
  }
}

export interface BanyanConfig {
  $schema?: string
  defaultWorkspace: string
  theme?: ConfigThemeName
  lang?: ConfigLocale
  workspaces: Record<string, WorkspaceConfig>
}

export type AgentActivityReason = 'git-lock' | 'fs-heartbeat' | 'mux-session' | 'lockfile'

export interface AgentStatus {
  isActive: boolean
  reason?: AgentActivityReason
  detail?: string
  lastModifiedMs?: number
}

export type NodeModulesType = 'own' | 'shared' | 'none'

export interface WorktreeNode {
  id: string
  relPath: string
  repoAlias: string
  repoPath: string
  worktreePath: string
  branch: string
  headSha: string
  isBare: boolean
  dirtyCount: number
  ahead: number
  behind: number
  recentCommits: string[]
  nodeModulesType: NodeModulesType
  sharedNodeModulesTarget?: string
  sharedNodeModulesWorktreeId?: string
  detectedEcosystems?: EcosystemId[]
  sharedEnvs?: SharedEnvInfo[]
  agentStatus: AgentStatus
}

export interface JunctionLink {
  sourceWorktreeId: string
  sourceWorktreePath: string
  packageName: string
  linkPath: string
  targetRealPath: string
  targetWorktreeId?: string
  targetRepoAlias?: string
  targetBranch?: string
  isBroken: boolean
  isHighlightedScope: boolean
  ecosystem?: EcosystemId
  mechanism?: LinkMechanism
  manifestFile?: string
}

export type CollisionType =
  | 'MULTI_CONSUMER_DIRTY'
  | 'BRANCH_MISMATCH'
  | 'BROKEN_LINK'
  | 'SHARED_NM_DIRTY'
  | 'SHARED_ENV_DIRTY'
  | 'EXTERNAL_TARGET'
  | 'MISSING_REPO'

export interface CollisionWarning {
  id: string
  severity: 'critical' | 'warning'
  type: CollisionType
  /** Canonical English message. */
  message: string
  /** Spanish translation of `message` (see `localizeWarningMessage`). */
  messageEs?: string
  affectedWorktreeIds: string[]
  suggestedFixCommand?: string
}

export interface MissingRepoInfo {
  alias: string
  path: string
}

export interface EcosystemSnapshot {
  workspaceName: string
  timestamp: number
  muxBackend: 'psmux' | 'tmux'
  worktrees: WorktreeNode[]
  junctions: JunctionLink[]
  warnings: CollisionWarning[]
  missingRepos?: MissingRepoInfo[]
}
