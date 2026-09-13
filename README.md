# kilo-opencode-command-code

[![CI](https://github.com/moyu-by/kilo-opencode-command-code/actions/workflows/ci.yml/badge.svg)](https://github.com/moyu-by/kilo-opencode-command-code/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/kilo-opencode-command-code.svg)](https://www.npmjs.com/package/kilo-opencode-command-code)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

同时接入 [Kilo](https://kilo.ai) 与 [OpenCode](https://opencode.ai) 的 [Command Code Provider API](https://commandcode.ai/docs/provider) 插件。同一份文件，两端可用，零依赖。

## 快速开始

### 1. 安装

**方式 A：npm（最简单，只加一行配置）**

```jsonc
// Kilo：~/.config/kilo/kilo.jsonc
"plugin": ["kilo-opencode-command-code"]
```

```jsonc
// OpenCode：~/.config/opencode/opencode.json
"plugin": ["kilo-opencode-command-code"]
```

**方式 B：克隆 + 一键脚本（Kilo 和 OpenCode 一起装）**

```bash
git clone https://github.com/moyu-by/kilo-opencode-command-code.git
cd kilo-opencode-command-code
bash install.sh          # Windows: powershell -ExecutionPolicy Bypass -File .\install.ps1
```

### 2. 登录

Kilo 与 OpenCode 凭据库独立，需各登录一次：

```bash
kilo auth login -p cmdcode      # Kilo
opencode auth login             # OpenCode，选择 Command Code
```

不想登录，就用环境变量直接给 key：

```bash
CMD_API_KEY=sk-xxxx kilo
CMD_API_KEY=sk-xxxx opencode
```

重启客户端生效。

### 3. 使用

- **选模型**：Kilo 按 `ctrl+x m` 或输入 `/models`，搜索 `cmdcode/`
- **直接运行**：`kilo run -m cmdcode/deepseek/deepseek-v4.1-flash "你的问题"`
- **思考档位**：选模型后挑变体 `low / medium / high`；Claude 为 `thinking-on / thinking-off`
- **图片**：视觉模型（如 `cmdcode/deepseek/deepseek-v4.1-flash`）可直接粘贴/上传

## 功能

- **双端兼容**：同一份 `index.js`，Kilo 和 OpenCode 都能用
- **模型自动同步**：启动时拉取 `/provider/v1/models`，断网走本地缓存，统一 `cmdcode` 入口
- **能力自动同步**：从官方模型表抓取每个模型的 `Text / Vision / Reasoning` 标注，自动声明 `modalities` 与 `reasoning`
  - 视觉模型可正常接收图片（修复 "does not support image input"）
  - 非推理模型不生成思考档位变体
  - 缓存于 `.capabilities.json`，7 天有效期；失败时用旧缓存，仍无则退回关键词兜底
- **Claude 自动路由**：Claude 走 Anthropic Messages 端点，其余走 OpenAI Chat Completions
- **零配置即用**：装好 + 登录一次即可；环境变量可免登录
- **可手动覆盖**：按需覆盖单个模型的模态/参数，无需改插件

## 手动安装（方式 B 的可选替代）

Kilo，任选其一（不要同时用，避免 provider 重复注册）：

```jsonc
// ~/.config/kilo/kilo.jsonc 的 plugin 数组
"plugin": ["file:///绝对路径/kilo-opencode-command-code"]
```

```bash
# 放进 Kilo 全局插件目录
mkdir -p ~/.config/kilo/plugins
cp index.js ~/.config/kilo/plugins/command-code.js
```

OpenCode（从 `~/.config/opencode/plugins/` 或项目的 `.opencode/plugins/` 自动加载）：

```bash
mkdir -p ~/.config/opencode/plugins
cp index.js ~/.config/opencode/plugins/command-code.js
```

## 环境变量

| 变量 | 作用 |
|---|---|
| `CMD_API_KEY` | 直接提供 API key（优先级最高） |
| `COMMANDCODE_API_KEY` / `COMMAND_CODE_API_KEY` / `CMDCODE_API_KEY` | 同上，别名 |
| `CMD_MODELS_DOCS_URL` | 覆盖能力表来源（默认官方模型表页） |

优先级：环境变量 > 凭据库中登录保存的 key。两者都没有时，客户端会照常提示登录。

## 能力覆盖（一般不需要）

能力（Vision / Reasoning）默认从官方模型表自动同步，通常无需干预。若个别模型判错或想离线锁定，在配置文件里覆盖即可：

```jsonc
{
  "provider": {
    "cmdcode": {
      "models": {
        // 强制某个模型支持图片输入
        "some/vendor/model": {
          "modalities": { "input": ["text", "image"], "output": ["text"] }
        }
        // 强制某个模型为纯文本
        // ,"another/model": {
        //   "modalities": { "input": ["text"], "output": ["text"] }
        // }
      }
    }
  }
}
```

也可以在 `index.js` 顶部改 `VISION_HINTS` / `FORCE_TEXT_ONLY` / `FORCE_VISION`（仅在文档同步失败、走关键词兜底时生效）。

## 换 Key

```bash
kilo auth login -p cmdcode
opencode auth login
```

## 文件结构

```
index.js            插件主文件（Kilo 与 OpenCode 共用）
install.sh          Linux/macOS/Git-Bash 安装脚本（同步到 OpenCode）
install.ps1         Windows PowerShell 安装脚本
test/               node:test 测试
.github/workflows/  CI 与发布流程
.cache.json         模型列表缓存（运行时自动生成，已 gitignore）
.capabilities.json  能力表缓存（运行时自动生成，7 天有效期，已 gitignore）
```

## 发布与 CI/CD

- `.github/workflows/ci.yml`：push / PR 时在 Node 20、22 上执行 `node --check` 与 `node --test`。
- `.github/workflows/release.yml`：推送 `v*` tag 时校验 tag 与 `package.json` 版本一致、跑测试，然后 `npm publish --provenance --access public`。

本地开发与发布：

```bash
npm run check                  # 语法检查
npm test                       # 运行测试
npm login && npm publish --access public   # 首次手动发布
npm version patch && git push --follow-tags # 之后用 tag 触发 CI 发布
```

CI 发布需在仓库 Secrets 添加 `NPM_TOKEN`（npm Automation Token，或带 publish 权限的 Granular Token）。

> 可选：npm 已支持 Trusted Publishing（OIDC，无需长期 token）。在 npm 包设置里绑定本仓库与 `release.yml` 后，删掉 workflow 里的 `NODE_AUTH_TOKEN` 即可。

## 说明

- 插件零第三方依赖、纯 ESM；`import.meta.dirname` 不可用时自动回退 `fileURLToPath`，跨平台安全。
- 缓存文件生成在插件文件同目录，因此该目录需要可写。

## License

[MIT](./LICENSE)
