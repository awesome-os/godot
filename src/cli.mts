#!/usr/bin/env node
/**
 * @file src/cli.mts
 * @description Zero-installer `godot` CLI:
 *   - Hydrates rolling-latest MIT Godot 4 from `awesome-os/b8g-ghost @ cas-v1`
 *     into `~/.b8g/cas/godot/<sha256>/` if missing.
 *   - Spawns `godot.exe` (Win64) / `godot` (Linux) / `Godot` (macOS) detached.
 *   - `--dry-run`: resolves CAS entries and prints the launch plan JSON without spawning.
 *   - `--version` / `-v`: prints version and platform CAS asset key.
 */

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureGodotBinary,
  fetchGhostIndex,
  getGhostCacheDir,
  getGodotAssetKey,
  getGodotExecutableRelPath,
  tryResolveGodotEntry,
} from './hydrate.mts';

export interface ParsedCliArgs {
  dryRun: boolean;
  showVersion: boolean;
  showHelp: boolean;
  forwardArgs: string[];
}

export interface LaunchPlan {
  version: string;
  cacheDir: string;
  godot: {
    assetKey: string;
    status: 'resolved' | 'pending-ingest';
    sha256: string | null;
    bytes: number | null;
    godotVersion: string | null;
    executablePath: string | null;
    workingDir: string | null;
  };
  forwardArgs: string[];
}

export function getPackageVersion(): string {
  try {
    const pkgPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    return pkg.version ?? '0.1.0';
  } catch {
    return '0.1.0';
  }
}

export function parseCliArgs(argv: readonly string[]): ParsedCliArgs {
  const forwardArgs: string[] = [];
  let dryRun = false;
  let showVersion = false;
  let showHelp = false;
  let passthrough = false;

  for (const arg of argv) {
    if (!passthrough && arg === '--') {
      passthrough = true;
      forwardArgs.push(arg);
      continue;
    }
    if (!passthrough && arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (!passthrough && (arg === '--version' || arg === '-v')) {
      showVersion = true;
      continue;
    }
    if (!passthrough && (arg === '--help' || arg === '-h')) {
      showHelp = true;
      continue;
    }
    if (!passthrough && arg === '--no-splash') {
      continue;
    }
    forwardArgs.push(arg);
  }

  return { dryRun, showVersion, showHelp, forwardArgs };
}

export async function buildLaunchPlan(parsed: ParsedCliArgs): Promise<LaunchPlan> {
  const idx = await fetchGhostIndex();
  const cacheDir = getGhostCacheDir();
  const godotKey = getGodotAssetKey();
  const entry = await tryResolveGodotEntry(godotKey, idx);
  const executablePath = entry
    ? join(cacheDir, 'godot', entry.sha256, getGodotExecutableRelPath())
    : null;
  const workingDir = executablePath ? dirname(executablePath) : null;

  return {
    version: getPackageVersion(),
    cacheDir,
    godot: {
      assetKey: godotKey,
      status: entry ? 'resolved' : 'pending-ingest',
      sha256: entry?.sha256 ?? null,
      bytes: entry?.bytes ?? null,
      godotVersion: entry?.version ?? null,
      executablePath,
      workingDir,
    },
    forwardArgs: parsed.forwardArgs,
  };
}

export async function runCli(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const parsed = parseCliArgs(argv);

  if (parsed.showVersion) {
    console.log(
      `@awesome-os/godot ${getPackageVersion()} (${process.platform}/${process.arch} | godot=${getGodotAssetKey()})`,
    );
    return;
  }

  if (parsed.showHelp) {
    console.log(
      [
        `godot ${getPackageVersion()} - Rolling-latest MIT Godot 4 on b8g-ghost CAS`,
        '',
        'Usage: godot [options] [godot flags...]',
        '',
        'Options:',
        '  --dry-run     Resolve CAS entry and print launch plan JSON without launching',
        '  --no-splash   Skip Lumi Hydration Splash (native launcher)',
        '  -v, --version Print version and platform CAS asset key',
        '  -h, --help    Show this help message',
        '',
        'Environment:',
        '  GODOT_GHOST_SHA256  Pin to a Keep-Last-5 SHA-256 from b8g-ghost cas-v1',
        '  GODOT_PROGRESS=1    Emit GHOST_PROGRESS <pct> <msg> lines on stdout',
      ].join('\n'),
    );
    return;
  }

  if (parsed.dryRun) {
    const plan = await buildLaunchPlan(parsed);
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  const godot = await ensureGodotBinary();

  if (process.env.GODOT_VERBOSE === '1') {
    console.error(
      `[awesome-os/godot] executable=${godot.executablePath} cwd=${godot.workingDir} (cacheHit=${godot.cacheHit})`,
    );
  }

  const child = spawn(godot.executablePath, parsed.forwardArgs, {
    cwd: process.cwd(),
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
    env: {
      ...process.env,
      B8G_GHOST_CAS_DIR: getGhostCacheDir(),
    },
  });
  child.unref();
}

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  await runCli();
}
