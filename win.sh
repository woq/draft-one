#!/usr/bin/env bash
set -e

WIN_DIR="D:\\code\\draft-one"
NODE_PATH="C:\\Program Files\\nodejs;C:\\Users\\Administrator\\AppData\\Local\\pnpm;C:\\Users\\Administrator\\AppData\\Local\\pnpm\\bin;"

run_in_win() {
  local cmd="$1"
  powershell.exe -NoProfile -Command "
    \$env:Path = '${NODE_PATH}' + \$env:Path;
    \$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/';
    \$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/';
    Set-Location '${WIN_DIR}';
    ${cmd}
  " < /dev/null
}

case "$1" in
  install)
    echo "==> [Windows] Installing dependencies with pnpm..."
    run_in_win "pnpm install"
    ;;
  dev)
    echo "==> [Windows] Launching Electron Dev Server & Native Window..."
    run_in_win "pnpm dev"
    ;;
  build)
    echo "==> [Windows] Building project with electron-vite..."
    run_in_win "pnpm build"
    ;;
  build:win)
    echo "==> [Windows] Packaging Windows executable..."
    run_in_win "pnpm build:win"
    ;;
  build:release)
    echo "==> [Windows] Packaging Full (ZIP + NSIS) and Incremental Update ZIP..."
    run_in_win "pnpm build:release"
    ;;
  build:incremental)
    echo "==> [Windows] Packaging Incremental Update ZIP..."
    run_in_win "pnpm build:incremental"
    ;;
  test)
    echo "==> [Windows] Running typecheck and automated unit tests..."
    run_in_win "pnpm test"
    ;;
  typecheck)
    echo "==> [Windows] Running typecheck..."
    run_in_win "pnpm typecheck"
    ;;
  exec)
    shift
    echo "==> [Windows] Executing pnpm $*..."
    run_in_win "pnpm $*"
    ;;
  *)
    echo "Usage: ./win.sh [install|dev|build|build:win|build:release|build:incremental|test|typecheck|exec <args>]"
    echo ""
    echo "Commands:"
    echo "  install           - Run 'pnpm install' in Windows"
    echo "  dev               - Run 'pnpm dev' in Windows (pops up native GUI)"
    echo "  build             - Run 'pnpm build' in Windows"
    echo "  build:win         - Run 'pnpm build:win' to generate full packages"
    echo "  build:release     - Run full release build (NSIS Setup + Full ZIP + Incremental ZIP)"
    echo "  build:incremental - Generate ~1.5MB incremental update ZIP from current build"
    echo "  test              - Run 'pnpm test' in Windows"
    echo "  exec ...          - Run arbitrary pnpm command in Windows"
    exit 1
    ;;
esac
