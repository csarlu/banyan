import { JunctionLink, WorkspaceConfig, WorktreeNode } from './types.js'
import { scanAllAdapterLinks } from './adapters/index.js'

export async function scanAllJunctions(
  worktrees: WorktreeNode[],
  workspaceConfig: WorkspaceConfig,
): Promise<JunctionLink[]> {
  return scanAllAdapterLinks(worktrees, workspaceConfig)
}
