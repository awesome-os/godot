/**
 * @file src/index.mts
 * @description Public API for @awesome-os/godot: CAS hydration and launch helpers.
 */

export {
  applyKeepLast5Pin,
  ensureGodotBinary,
  fetchGhostIndex,
  GHOST_CAS_BASE_URL,
  GHOST_INDEX_URL,
  getGhostCacheDir,
  getGodotAssetKey,
  getGodotExecutableRelPath,
  locateExtractedExecutable,
  resolveGodotEntry,
  tryResolveGodotEntry,
  type GhostCasEntry,
  type GhostCasHistoryItem,
  type GhostIndex,
  type HydratedGodotResult,
} from './hydrate.mts';

export {
  buildLaunchPlan,
  getPackageVersion,
  parseCliArgs,
  runCli,
  type LaunchPlan,
  type ParsedCliArgs,
} from './cli.mts';
