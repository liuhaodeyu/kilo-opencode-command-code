# kilo-opencode-command-code

[![CI](https://github.com/moyu-by/kilo-opencode-command-code/actions/workflows/ci.yml/badge.svg)](https://github.com/moyu-by/kilo-opencode-command-code/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/kilo-opencode-command-code.svg)](https://www.npmjs.com/package/kilo-opencode-command-code)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

**一个插件，同时接入 [Kilo](https://kilo.ai) 与 [OpenCode](https://opencode.ai) 的 [Command Code Provider API](https://commandcode.ai/docs/provider)。**

同一份 `index.js` 兼容 Kilo 与 OpenCode 两套插件 API；跨平台（Windows / macOS / Linux），零第三方依赖，纯 ESM。

## 功能

- **双端兼容**：同一份插件文件，Kilo 和 OpenCode 都能用
- **模型自动同步**：启动时拉取 `/provider/v1/models`，断网走本地缓存，单一 `cmdcode` 入口统一展示
- **能力自动同步**：从官方模型表抓取每个模型的 `Text / Vision / Reasoning` 标注，自动声明 `modalities.input` 与 `reasoning`，无需手工维护
  - 视觉模型（如 `deepseek/deepseek-v4.1-flash`）可直接接收图片（修复 "does not support image input"）
  - 非推理模型不再生成思考档位变体
  - 能力表缓存于 `.capabilities.json`，7 天有效期；断网/抓取失败时用旧缓存，仍无则退回关键词兜底
- **Claude 自动路由**：Claude 模型走 Anthropic Messages 端点，其余走 OpenAI Chat Completions
- **思考档位**：非 Claude 模型提供 `low / medium / high`，Claude 提供 `thinking-on / thinking-off`
- **零配置即用**：装好插件 + 登录一次即可；也可用环境变量 `CMD_API_KEY` 等免登录
- **可手动覆盖**：需要时可对单个模型的模态/参数做覆盖，无需改插件

## 安装

### 通过 npm（无需克隆）

Kilo 与 OpenCode 的 `plugin` 字段都支持 npm 包名，装好后会自动安装/更新：

```jsonc
// Kilo: ~/.config/kilo/kilo.jsonc
"plugin": ["kilo-opencode-command-code"]
```

```jsonc
// OpenCode: ~/.config/opencode/opencode.json
"plugin": ["kilo-opencode-command-code"]
```

然后照常登录（见下）。

### 从源码一键安装（Kilo + OpenCode）

Linux / macOS（或 Windows 的 Git-Bash / WSL）：

```bash
git clone https://github.com/moyu-by/kilo-opencode-command-code.git
cd kilo-opencode-command-code
bash install.sh
```

Windows 原生 PowerShell：

```powershell
git clone https://github.com/moyu-by/kilo-opencode-command-code.git
cd kilo-opencode-command-code
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

`install.sh` 会：向 Kilo 的 `kilo.jsonc` 写入 `file://` 插件引用，并把 `index.js` 同步到 OpenCode 的插件目录。
`install.ps1` 则只做复制（不改 jsonc，避免破坏注释），分别放进 Kilo 与 OpenCode 的全局 `plugins/` 目录。

### 登录

Kilo 与 OpenCode 的凭据库相互独立，需各登录一次；也可以用环境变量免登录（见下）。

```bash
kilo auth login -p cmdcode       # Kilo
opencode auth login              # OpenCode：交互列表中选择 Command Code
```

重启对应客户端生效。

### 手动安装（可选）

Kilo，任选其一（不要同时用，避免 provider 重复注册）：

```jsonc
// 方式 A：~/.config/kilo/kilo.jsonc 的 plugin 数组
"plugin": ["file:///绝对路径/kilo-opencode-command-code"]
```

```bash
# 方式 B：放进 Kilo 全局插件目录
mkdir -p ~/.config/kilo/plugins
cp index.js ~/.config/kilo/plugins/command-code.js
```

OpenCode（从 `~/.config/opencode/plugins/` 或项目的 `.opencode/plugins/` 自动加载）：

```bash
mkdir -p ~/.config/opencode/plugins
cp index.js ~/.config/opencode/plugins/command-code.js
```

## 使用

- 选模型：Kilo 用 `ctrl+x m` 或 `/models`，搜索 `cmdcode/`
- 切思考强度：选模型后选变体 `low` / `medium` / `high`
- Claude 思考开关：选变体 `thinking-on` / `thinking-off`
- CLI 指定：`kilo run -m cmdcode/deepseek/deepseek-v4-flash --variant high "prompt"`
- 视觉模型：能力自动同步，直接选 `cmdcode/deepseek/deepseek-v4.1-flash` 等即可粘贴/上传图片

## 环境变量

| 变量 | 作用 |
|---|---|
| `CMD_API_KEY` | 直接提供 API key（优先级最高） |
| `COMMANDCODE_API_KEY` / `COMMAND_CODE_API_KEY` / `CMDCODE_API_KEY` | 同上，别名 |
| `CMD_MODELS_DOCS_URL` | 覆盖能力表来源（默认官方模型表页） |

设置任一 key 变量即可免登录：

```bash
CMD_API_KEY=sk-xxxx kilo
CMD_API_KEY=sk-xxxx opencode
```

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

配置条目与自动结果按“条目内顶层键合并”，`name / limit / variants` 等仍由插件自动补齐。

也可以直接编辑 `index.js` 顶部的常量（仅在文档同步失败、走关键词兜底时生效）：`VISION_HINTS`、`FORCE_TEXT_ONLY` / `FORCE_VISION`。

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

## 说明

- 插件零第三方依赖、纯 ESM；`import.meta.dirname` 不可用时自动回退 `fileURLToPath`，跨平台安全。
- 缓存文件生成在插件文件同目录，因此该目录需要可写。

## 发布与 CI/CD

- `.github/workflows/ci.yml`：push / PR 时在 Node 20、22 上执行 `node --check` 与 `node --test`。
- `.github/workflows/release.yml`：推送 `v*` tag 时校验 tag 与 `package.json` 版本一致、跑测试，然后 `npm publish --provenance --access public`。

本地开发：

```bash
npm run check   # 语法检查
npm test        # 运行测试
```

首次发布（手动）：

```bash
npm login
npm publish --access public
```

在 CI 中发布前，先在 GitHub 仓库添加 Secret `NPM_TOKEN`（npm → Access Tokens → 生成 Automation Token，或带 publish 权限的 Granular Token）。之后用 tag 触发：

```bash
npm version patch        # 或 minor / major，会创建 vX.Y.Z tag
git push --follow-tags   # 推送提交与 tag，触发 Release 工作流
```

> 可选：npm 已支持 Trusted Publishing（OIDC，无需长期 token）。在 npm 包设置里绑定本仓库与 `release.yml` 后，删掉 workflow 里的 `NODE_AUTH_TOKEN` 即可。`--provenance` 需要仓库公开且 `id-token: write`（已配置）。

## License

[MIT](./LICENSE)
