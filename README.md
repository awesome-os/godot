> [!NOTE] Consolidated into https://github.com/awesome-os/devtools

# `@awesome-os/godot`

Rolling-latest MIT **Godot 4** hydrated on demand from [`awesome-os/b8g-ghost`](https://github.com/awesome-os/b8g-ghost) (`cas-v1`) with a `~118 KB` native 5-target (Win64, Linux x64/ARM64, macOS ARM64, `wasm32-wasi`) C11 **Lumi Hydration Splash** launcher (Keep-Last-5, zero installer).

## Quick Install & Usage

### Windows (PowerShell 1-liner)

```powershell
irm https://github.com/awesome-os/godot/releases/latest/download/install.ps1 | iex
```

### Linux (x64 / ARM64) & macOS (Apple Silicon)

```sh
curl -fsSL https://github.com/awesome-os/godot/releases/latest/download/install.sh | sh
```

### CLI Usage

```powershell
# Inspect installed launcher version & help
godot --version
godot --help

# Launch Godot 4 or open a project directly
godot
godot ./project.godot

# Optional: store hydrated CAS layers on a custom drive/path
$env:B8G_GHOST_CACHE_DIR = "D:\b8g-cas"   # POSIX: export B8G_GHOST_CACHE_DIR=/data/b8g-cas
godot
```

### Releases & Verification

- **Latest Release:** [`awesome-os/godot` Releases](https://github.com/awesome-os/godot/releases/latest) — includes `SHA256SUMS.txt` and the 5-OS matrix (`win64`, `linux-x64`, `linux-arm64`, `macos-arm64`, `wasm32-wasi`) built via [`awesome-os/maintenance-workflows`](https://github.com/awesome-os/maintenance-workflows).

## Highlights

- **Zero Installer & Zero Bloat:** Hydrates directly into `~/.b8g/cas/godot/<sha256>/` and spawns `godot.exe` (Win64) / `godot` (Linux) / `Godot` (macOS) detached.
- **SHA-256 Verified Ghost CAS (`cas-v1`):** Downloads `godot-win64.tar.zst` / `godot-linux-x64.tar.zst`, verifies SHA-256 before extraction, and supports Keep-Last-5 rollback via `GODOT_GHOST_SHA256=<sha256>`.
- **Instant `< 15 ms` 5-Target Lumi Hydration Splash:** Native C11 launcher (`src/godot_launcher.c`) compiles cleanly with 0 warnings across Win64, Linux x64/ARM64 static musl, macOS ARM64, and `wasm32-wasi`, displaying the embedded Lumi White Dragon icon on Windows and streaming live `GHOST_PROGRESS <pct> <msg>` updates during cold CAS hydration.
- **Erasable TypeScript Direct Execution:** Zero build/transpile step (`erasableSyntaxOnly: true`, `noEmit: true`), runs directly on Node 22.18+ / Node 24.

## Usage

### Native Launcher (`godot.exe` / `godot-linux-x64` / `godot-linux-arm64` / `godot-macos-arm64` / `godot.wasm`)

```powershell
# Launch Godot 4 with Lumi Hydration Splash
.\dist\godot.exe

# Inspect version & CAS asset key
.\dist\godot.exe --version
```

### Node CLI (`src/cli.mts`)

```powershell
# Print version and platform CAS key
node src/cli.mts --version

# Resolve CAS index and print launch plan JSON without spawning
node src/cli.mts --dry-run

# Stream GHOST_PROGRESS lines during hydration
$env:GODOT_PROGRESS="1"; node src/cli.mts
```

## Environment Variables

| Variable | Description |
| :--- | :--- |
| `GODOT_GHOST_SHA256` | Pin to a Keep-Last-5 historical SHA-256 from `b8g-ghost @ cas-v1`. |
| `GODOT_PROGRESS=1` | Emit `GHOST_PROGRESS <pct> <msg>` lines on stdout during hydration. |
| `GODOT_CLI_PATH` | Override path to `src/cli.mts` for the native C11 launcher. |
| `B8G_GHOST_CACHE_DIR` | Override default `~/.b8g/cas` cache directory. |

## Build & Test

```powershell
# Run CAS & CLI test suite
node --test test/godot-cas.test.mts

# Compile all 5 native C11 targets via Zig 0.14.1 (0 warnings)
zig cc -target x86_64-windows-gnu -std=c11 -Os -s -Wl,--subsystem,windows -Wall -Wextra src/godot_launcher.c lumi.res -lgdi32 -luser32 -o dist/godot.exe
zig cc -target x86_64-linux-musl -static -std=c11 -Os -s -Wall -Wextra src/godot_launcher.c -o dist/godot-linux-x64
zig cc -target aarch64-linux-musl -static -std=c11 -Os -s -Wall -Wextra src/godot_launcher.c -o dist/godot-linux-arm64
zig cc -target aarch64-macos -std=c11 -Os -s -Wall -Wextra src/godot_launcher.c -o dist/godot-macos-arm64
zig cc -target wasm32-wasi -std=c11 -Os -s -Wall -Wextra src/godot_launcher.c -o dist/godot.wasm
```

## License

Licensed under the **MIT License**.

## Quick Install & Run (Windows / Linux / macOS)

```sh
# Install / hydrate from v11 CAS via holo-pm
holo-pm install repository://github.com/awesome-os/godot@main

# Or project & run directly via holo-project (0-byte hardlink)
holo-project "project://node/godot?from=repository://github.com/awesome-os/godot@main"
```
