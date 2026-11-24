import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  applyKeepLast5Pin,
  buildLaunchPlan,
  fetchGhostIndex,
  getGodotAssetKey,
  getGodotExecutableRelPath,
  parseCliArgs,
  tryResolveGodotEntry,
  type GhostCasEntry,
} from '../src/index.mts';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI_PATH = resolve(REPO_ROOT, 'src', 'cli.mts');

test('fetches live b8g-ghost cas-v1 index and checks godot-* entry gracefully', async () => {
  const index = await fetchGhostIndex(true);
  assert.ok(index.total_entries > 0, 'Expected non-empty cas-v1 index');

  const godotKey = getGodotAssetKey();
  const godotEntry = await tryResolveGodotEntry(godotKey, index);

  if (godotEntry) {
    assert.equal(godotEntry.filename, godotKey);
    assert.match(godotEntry.sha256, /^[a-f0-9]{64}$/);
    assert.ok(godotEntry.bytes > 10_000_000, 'Expected real Godot 4 archive (>10 MB)');
  } else {
    assert.equal(godotEntry, null);
  }
});

test('maps platform asset keys and executable paths accurately', () => {
  assert.equal(getGodotAssetKey('win32', 'x64'), 'godot-win64.tar.zst');
  assert.equal(getGodotAssetKey('linux', 'x64'), 'godot-linux-x64.tar.zst');
  assert.equal(getGodotAssetKey('linux', 'arm64'), 'godot-linux-arm64.tar.zst');
  assert.equal(getGodotAssetKey('darwin', 'arm64'), 'godot-macos-arm64.tar.zst');

  assert.equal(getGodotExecutableRelPath('win32'), 'godot.exe');
  assert.equal(getGodotExecutableRelPath('linux'), 'godot');
  assert.equal(getGodotExecutableRelPath('darwin'), join('Godot.app', 'Contents', 'MacOS', 'Godot'));
});

test('applies Keep-Last-5 GODOT_GHOST_SHA256 pin when present in history', () => {
  const latestSha = 'a'.repeat(64);
  const prevSha = 'b'.repeat(64);
  const entry: GhostCasEntry = {
    filename: 'godot-win64.tar.zst',
    sha256: latestSha,
    bytes: 58_000_000,
    version: '4.4.1-stable',
    download_url: `https://github.com/awesome-os/b8g-ghost/releases/download/cas-v1/${latestSha}`,
    history: [
      {
        sha256: prevSha,
        bytes: 56_000_000,
        version: '4.4-stable',
        retired_at: '2026-11-20T00:00:00Z',
      },
    ],
  };

  const pinned = applyKeepLast5Pin(entry, prevSha);
  assert.equal(pinned.sha256, prevSha);
  assert.equal(pinned.bytes, 56_000_000);
  assert.equal(pinned.version, '4.4-stable');
  assert.ok(pinned.download_url.endsWith(`/${prevSha}`));

  const unpinned = applyKeepLast5Pin(entry, 'c'.repeat(64));
  assert.equal(unpinned.sha256, latestSha);
});

test('parses CLI flags (--dry-run, --version, --no-splash, passthrough)', () => {
  const parsed = parseCliArgs(['--dry-run', '--no-splash', '--editor', '--', '--version']);
  assert.equal(parsed.dryRun, true);
  assert.equal(parsed.showVersion, false);
  assert.deepEqual(parsed.forwardArgs, ['--editor', '--', '--version']);

  const ver = parseCliArgs(['-v']);
  assert.equal(ver.showVersion, true);
});

test('CLI --version and --dry-run execute cleanly and resolve CAS launch plan', async () => {
  const versionOut = execFileSync(process.execPath, [CLI_PATH, '--version'], {
    encoding: 'utf8',
  }).trim();
  assert.match(versionOut, /^@awesome-os\/godot 0\.1\.0 /);
  assert.ok(versionOut.includes(getGodotAssetKey()));

  const dryRunOut = execFileSync(process.execPath, [CLI_PATH, '--dry-run', '--editor'], {
    encoding: 'utf8',
  });
  const plan = JSON.parse(dryRunOut) as Awaited<ReturnType<typeof buildLaunchPlan>>;
  assert.equal(plan.version, '0.1.0');
  assert.equal(plan.godot.assetKey, getGodotAssetKey());
  assert.ok(plan.godot.status === 'resolved' || plan.godot.status === 'pending-ingest');
  if (plan.godot.executablePath) {
    assert.equal(plan.godot.workingDir, dirname(plan.godot.executablePath));
  }
  assert.deepEqual(plan.forwardArgs, ['--editor']);
});
