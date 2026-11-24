/**
 * @file src/hydrate.mts
 * @description Resolves and hydrates rolling-latest MIT Godot 4
 *   (`godot-win64.tar.zst` / `godot-linux-x64.tar.zst`) from
 *   `awesome-os/b8g-ghost @ cas-v1` into `~/.b8g/cas/godot/<sha256>/`
 *   with SHA-256 verification, Keep-Last-5 `GODOT_GHOST_SHA256` pinning,
 *   and streaming `GHOST_PROGRESS <pct> <msg>` output when `GODOT_PROGRESS=1`.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const GHOST_INDEX_URL =
  process.env.B8G_GHOST_INDEX_URL ??
  'https://raw.githubusercontent.com/awesome-os/b8g-ghost/main/manifests/index.json';

export const GHOST_CAS_BASE_URL =
  process.env.B8G_GHOST_CAS_URL ??
  'https://github.com/awesome-os/b8g-ghost/releases/download/cas-v1';

export interface GhostCasHistoryItem {
  sha256: string;
  bytes: number;
  version?: string;
  retired_at?: string;
}

export interface GhostCasEntry {
  filename: string;
  sha256: string;
  bytes: number;
  raw_bytes?: number;
  version?: string;
  category?: string;
  download_url: string;
  history?: GhostCasHistoryItem[];
}

export interface GhostIndex {
  schema: string;
  cas_base_url: string;
  updated_at: string;
  total_entries: number;
  entries: Record<string, GhostCasEntry>;
}

export interface HydratedGodotResult {
  entry: GhostCasEntry;
  installDir: string;
  executablePath: string;
  workingDir: string;
  cacheHit: boolean;
}

let cachedIndex: GhostIndex | null = null;

export function getGhostCacheDir(): string {
  const dir = process.env.B8G_GHOST_CACHE_DIR ?? join(homedir(), '.b8g', 'cas');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getGodotAssetKey(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string {
  if (platform === 'win32') return 'godot-win64.tar.zst';
  if (platform === 'darwin') {
    return arch === 'arm64' ? 'godot-macos-arm64.tar.zst' : 'godot-macos-x64.tar.zst';
  }
  return arch === 'arm64' ? 'godot-linux-arm64.tar.zst' : 'godot-linux-x64.tar.zst';
}

export function getGodotExecutableRelPath(platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32') return 'godot.exe';
  if (platform === 'darwin') return join('Godot.app', 'Contents', 'MacOS', 'Godot');
  return 'godot';
}

export async function fetchGhostIndex(forceRefresh = false): Promise<GhostIndex> {
  if (cachedIndex && !forceRefresh) {
    return cachedIndex;
  }
  const cacheFile = join(getGhostCacheDir(), 'index.json');
  try {
    const res = await fetch(GHOST_INDEX_URL, {
      headers: { 'User-Agent': 'awesome-os-godot/0.1.0' },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${GHOST_INDEX_URL}`);
    }
    const json = (await res.json()) as GhostIndex;
    try {
      const tmp = `${cacheFile}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(json, null, 2), 'utf8');
      renameSync(tmp, cacheFile);
    } catch {
      // Non-fatal if cache write races
    }
    cachedIndex = json;
    return json;
  } catch (err) {
    if (existsSync(cacheFile)) {
      cachedIndex = JSON.parse(readFileSync(cacheFile, 'utf8')) as GhostIndex;
      return cachedIndex;
    }
    throw err;
  }
}

export function applyKeepLast5Pin(entry: GhostCasEntry, pinnedSha?: string): GhostCasEntry {
  const sha = pinnedSha?.trim().toLowerCase();
  if (!sha || sha === entry.sha256.toLowerCase()) {
    return entry;
  }
  const hist = entry.history?.find((h) => h.sha256.toLowerCase() === sha);
  if (hist) {
    return {
      ...entry,
      sha256: hist.sha256,
      bytes: hist.bytes,
      version: hist.version ?? entry.version,
      download_url: `${GHOST_CAS_BASE_URL}/${hist.sha256}`,
    };
  }
  return entry;
}

export async function tryResolveGodotEntry(
  assetKey = getGodotAssetKey(),
  index?: GhostIndex,
): Promise<GhostCasEntry | null> {
  const idx = index ?? (await fetchGhostIndex());
  const entry = idx.entries[assetKey];
  if (!entry) {
    return null;
  }
  return applyKeepLast5Pin(entry, process.env.GODOT_GHOST_SHA256);
}

export async function resolveGodotEntry(
  assetKey = getGodotAssetKey(),
  index?: GhostIndex,
): Promise<GhostCasEntry> {
  const idx = index ?? (await fetchGhostIndex());
  const entry = await tryResolveGodotEntry(assetKey, idx);
  if (!entry) {
    throw new Error(
      `Godot 4 asset "${assetKey}" not found in b8g-ghost cas-v1 index (${idx.total_entries} entries). Run ingest-godot-cas.yml in awesome-os/b8g-ghost to publish it.`,
    );
  }
  return entry;
}

function emitProgress(percent: number, message: string): void {
  if (process.env.GODOT_PROGRESS === '1') {
    const pct = Math.max(0, Math.min(100, Math.round(percent)));
    process.stdout.write(`GHOST_PROGRESS ${pct} ${message}\n`);
  }
}

async function downloadVerifiedBlob(
  entry: GhostCasEntry,
  destPath: string,
  pctStart = 10,
  pctEnd = 82,
): Promise<boolean> {
  if (existsSync(destPath)) {
    const actual = createHash('sha256').update(readFileSync(destPath)).digest('hex');
    if (actual === entry.sha256) {
      emitProgress(pctEnd, `Warm CAS hit: ${entry.filename}`);
      return true;
    }
  }

  emitProgress(pctStart, `Hydrating ${entry.filename}...`);
  const url = entry.download_url || `${GHOST_CAS_BASE_URL}/${entry.sha256}`;
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'awesome-os-godot/0.1.0' },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} hydrating ${entry.filename} from ${url}`);
  }

  const totalBytes = Number(res.headers.get('content-length') ?? entry.bytes ?? 0);
  const chunks: Uint8Array[] = [];
  let received = 0;
  let lastPct = -1;

  if (res.body) {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.byteLength;
        if (totalBytes > 0) {
          const frac = Math.min(1, received / totalBytes);
          const curPct = Math.round(pctStart + frac * (pctEnd - pctStart));
          if (curPct !== lastPct) {
            lastPct = curPct;
            const mbDone = (received / 1048576).toFixed(1);
            const mbTot = (totalBytes / 1048576).toFixed(1);
            emitProgress(curPct, `Downloading ${entry.filename} (${mbDone} / ${mbTot} MB)`);
          }
        }
      }
    }
  } else {
    chunks.push(new Uint8Array(await res.arrayBuffer()));
  }

  emitProgress(pctEnd, `Verifying SHA-256 for ${entry.filename}...`);
  const buf = Buffer.concat(chunks);
  const actual = createHash('sha256').update(buf).digest('hex');
  if (actual !== entry.sha256) {
    throw new Error(
      `SHA-256 mismatch for ${entry.filename}: expected ${entry.sha256}, got ${actual}`,
    );
  }

  const tmp = `${destPath}.${process.pid}.tmp`;
  writeFileSync(tmp, buf);
  renameSync(tmp, destPath);
  return false;
}

export function locateExtractedExecutable(
  installDir: string,
  platform: NodeJS.Platform = process.platform,
): string | null {
  const relPath = getGodotExecutableRelPath(platform);
  const direct = join(installDir, relPath);
  if (existsSync(direct)) {
    return direct;
  }

  if (platform !== 'win32') {
    const flatBin = join(installDir, 'bin', 'godot');
    if (existsSync(flatBin)) {
      return flatBin;
    }
    const flatRoot = join(installDir, 'godot');
    if (existsSync(flatRoot)) {
      return flatRoot;
    }
  }

  if (existsSync(installDir)) {
    for (const dirent of readdirSync(installDir, { withFileTypes: true })) {
      if (!dirent.isDirectory()) continue;
      const nested = join(installDir, dirent.name, relPath);
      if (existsSync(nested)) {
        return nested;
      }
      if (platform !== 'win32') {
        const nestedFlat = join(installDir, dirent.name, 'godot');
        if (existsSync(nestedFlat)) {
          return nestedFlat;
        }
      }
    }
  }

  return null;
}

export async function ensureGodotBinary(
  assetKey = getGodotAssetKey(),
): Promise<HydratedGodotResult> {
  const entry = await resolveGodotEntry(assetKey);
  const cacheDir = getGhostCacheDir();
  const installDir = join(cacheDir, 'godot', entry.sha256);

  const existing = locateExtractedExecutable(installDir);
  if (existing) {
    emitProgress(92, `Warm CAS hit: Godot 4 ${entry.version ?? ''}`.trim());
    return {
      entry,
      installDir,
      executablePath: existing,
      workingDir: dirname(existing),
      cacheHit: true,
    };
  }

  const archivePath = join(cacheDir, `${entry.sha256}.tar.zst`);
  await downloadVerifiedBlob(entry, archivePath, 10, 80);

  emitProgress(84, `Extracting Godot 4 ${entry.version ?? ''}...`.trim());
  mkdirSync(installDir, { recursive: true });
  execFileSync('tar', ['--zstd', '-xf', archivePath, '-C', installDir], { stdio: 'inherit' });

  const executablePath = locateExtractedExecutable(installDir);
  if (!executablePath) {
    const expected = join(installDir, getGodotExecutableRelPath());
    throw new Error(`Extracted Godot 4 archive missing expected binary: ${expected}`);
  }

  if (process.platform !== 'win32') {
    try {
      chmodSync(executablePath, 0o755);
    } catch {
      // Non-fatal if filesystem does not support chmod
    }
  }

  emitProgress(96, 'Godot 4 ready');
  return {
    entry,
    installDir,
    executablePath,
    workingDir: dirname(executablePath),
    cacheHit: false,
  };
}
