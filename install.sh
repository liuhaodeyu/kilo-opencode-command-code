#!/usr/bin/env bash
#
# Linux / macOS / Git-Bash(Windows) 安装脚本
# 作用：
#   1) Kilo：向 ~/.config/kilo/kilo.jsonc 写入 file:// 插件引用
#   2) OpenCode：复制 index.js 到 ~/.config/opencode/plugins/（自动加载）
#
# Windows 原生 PowerShell 请用 install.ps1。

set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"
KILO_CONFIG="${HOME}/.config/kilo/kilo.jsonc"
FILE_REF="file://${PLUGIN_DIR}"
OPENCODE_PLUGIN_DIR="${HOME}/.config/opencode/plugins"
OPENCODE_PLUGIN_FILE="${OPENCODE_PLUGIN_DIR}/command-code.js"

echo "Plugin directory: ${PLUGIN_DIR}"

# 1) 清理历史遗留的旧版 cmdcode 插件文件（Kilo plugins 目录会整体自动加载）
OLD_PLUGIN="${HOME}/.config/kilo/plugins/cmdcode.js"
if [ -f "$OLD_PLUGIN" ]; then
  rm -f "$OLD_PLUGIN" \
        "$HOME/.config/kilo/plugins/cmdcode-models.js" \
        "$HOME/.config/kilo/plugins/cmdcode-auth.js"
  echo "Removed old plugin files from ~/.config/kilo/plugins/"
fi

# 2) Kilo：写入 file:// 引用（单一源文件，避免与 plugins 目录重复加载）
if [ -f "$KILO_CONFIG" ]; then
  if python3 -c "
import json
p = '$KILO_CONFIG'
d = json.load(open(p))
plugins = d.setdefault('plugin', [])
ref = '$FILE_REF'
if ref not in plugins:
    plugins.append(ref)
    json.dump(d, open(p, 'w'), indent=2, ensure_ascii=False)
    print(f'Added plugin reference to {p}')
else:
    print(f'Plugin reference already in {p}')
provider = d.get('provider', {})
removed = []
for key in list(provider.keys()):
    if key.startswith('cmdcode'):
        del provider[key]
        removed.append(key)
if removed:
    json.dump(d, open(p, 'w'), indent=2, ensure_ascii=False)
    names = ', '.join(removed)
    print(f'Removed static provider entries: {names}')
" 2>&1; then
    true
  else
    echo "Warning: Could not update kilo.jsonc automatically."
    echo "Add this to the 'plugin' array in $KILO_CONFIG:"
    echo "  \"$FILE_REF\""
  fi
else
  echo "Note: no kilo config at $KILO_CONFIG (skipped Kilo registration)."
fi

# 3) OpenCode：复制到全局 plugins 目录（该目录内 js 文件会被自动加载）
mkdir -p "$OPENCODE_PLUGIN_DIR"
cp "${PLUGIN_DIR}/index.js" "$OPENCODE_PLUGIN_FILE"
echo "Copied plugin to ${OPENCODE_PLUGIN_FILE} (OpenCode)"

echo ""
echo "Done! Restart Kilo / OpenCode, then run:"
echo "  kilo auth login -p cmdcode"
echo "  opencode auth login   # 交互选择 Command Code"
