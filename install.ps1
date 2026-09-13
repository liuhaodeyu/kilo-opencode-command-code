# install.ps1 — Windows (PowerShell 5.1+) 安装脚本
#
# 原理：Kilo 与 OpenCode 都会自动加载全局 plugins 目录下的 *.js 文件，
# 因此这里只做“复制文件”，不修改任何 json/jsonc 配置文件，规避 JSONC 注释
# 被 PowerShell 重写破坏的问题。
#
# 用法（在插件目录下）：
#   powershell -ExecutionPolicy Bypass -File .\install.ps1
# 或右键“使用 PowerShell 运行”。

$ErrorActionPreference = "Stop"

$PluginDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$IndexFile = Join-Path $PluginDir "index.js"
$HomeDir   = $env:USERPROFILE

if (-not (Test-Path $IndexFile)) {
  throw "index.js not found: $IndexFile"
}

# Kilo 全局 plugins 目录
$KiloPlugins = Join-Path $HomeDir ".config\kilo\plugins"
New-Item -ItemType Directory -Force -Path $KiloPlugins | Out-Null
Copy-Item $IndexFile (Join-Path $KiloPlugins "command-code.js") -Force
Write-Host "Installed to Kilo: $KiloPlugins\command-code.js"

# OpenCode 全局 plugins 目录
$OcPlugins = Join-Path $HomeDir ".config\opencode\plugins"
New-Item -ItemType Directory -Force -Path $OcPlugins | Out-Null
Copy-Item $IndexFile (Join-Path $OcPlugins "command-code.js") -Force
Write-Host "Installed to OpenCode: $OcPlugins\command-code.js"

# 提示：若 kilo.jsonc / opencode.json 里手动写过指向旧路径的 file:// 插件条目，
# 且该路径已不存在，请手动删除该条目，避免启动报错或重复注册。

Write-Host ""
Write-Host "Done! Restart Kilo / OpenCode, then run:"
Write-Host "  kilo auth login -p cmdcode"
Write-Host "  opencode auth login"
