import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = "https://api.commandcode.ai/provider/v1";
// 官方模型表，带每个模型的 Text/Vision/Reasoning 能力标注（aria-label）。
const MODELS_DOCS_URL = "https://commandcode.ai/docs/reference/cli/models";
const FETCH_TIMEOUT_MS = 8000;
// 能力元数据变化很慢，缓存 7 天；同时每次启动若过期才联网刷新。
const CAP_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 插件目录：Windows / Linux / macOS 通用。
 * Bun 与 Node >= 20.11 提供 import.meta.dirname，旧环境回退到 fileURLToPath。
 */
const PLUGIN_DIR =
  typeof import.meta.dirname === "string" && import.meta.dirname
    ? import.meta.dirname
    : path.dirname(fileURLToPath(import.meta.url));

const CACHE_FILE = path.join(PLUGIN_DIR, ".cache.json");
const CAP_FILE = path.join(PLUGIN_DIR, ".capabilities.json");

const MODALITY_KEYS = ["text", "image", "audio", "video", "pdf"];

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

const writeJson = (file, value) => {
  try {
    fs.writeFileSync(file, JSON.stringify(value));
  } catch {}
};

/* ------------------------------------------------------------------ */
/* 能力推断（文档同步 → 代码强制 → 关键词兜底）                          */
/* ------------------------------------------------------------------ */

/**
 * 命中以下任一关键词（匹配模型 id 或 name）即视为支持图片输入。
 * 仅在文档同步失败且无缓存时作为最后的兜底。
 */
const VISION_HINTS = [
  "vision", "image", // 例如 deepseek/deepseek-v4-flash-vision-exp
  "claude", // Anthropic Claude
  "gemini", // Google Gemini
  "gpt-4o", "gpt-4.1", "gpt-5", "o3", "o4", "o5", // OpenAI
  "qwen", // Qwen3.x Max/Plus/Flash 等多模态
  "glm", // Z.ai GLM
  "kimi", // Moonshot Kimi
  "grok", // xAI
  "pixtral", "gemma-3", "llama-4", "muse", "mimo", "minimax",
];

/** 命中 VISION_HINTS 但仍强制按纯文本注册的模型 id 片段（最高优先级）。 */
const FORCE_TEXT_ONLY = [];

/** 未命中 VISION_HINTS 但强制开启图片输入的模型 id 片段（最高优先级）。 */
const FORCE_VISION = [];

const hasHint = (id, name, hints) => {
  const hay = `${id} ${name}`.toLowerCase();
  return hints.some((s) => hay.includes(s.toLowerCase()));
};

/** 去掉 ISO 日期类后缀，便于把 claude-haiku-4-5-20251001 匹配到 claude-haiku-4-5。 */
const normId = (id) => id.toLowerCase().replace(/[-_]?\d{6,}$/, "").trim();

/**
 * 解析文档模型表：每行一个 <code>model-id</code> 和一个
 * aria-label="Capabilities: Text input, Vision, Reasoning"。
 */
function parseCapabilities(html) {
  const map = {};
  for (const row of html.split("<tr")) {
    const idm = row.match(/<code>([^<]+)<\/code>/);
    const capm = row.match(/aria-label="Capabilities: ([^"]+)"/);
    if (!idm || !capm) continue;
    const caps = capm[1];
    map[idm[1].trim()] = {
      vision: /Vision/i.test(caps),
      reasoning: /Reasoning/i.test(caps),
    };
  }
  return map;
}

/** 拉取并解析官方能力表；失败时回退到旧缓存，再不行返回 null（走关键词兜底）。 */
async function loadCapabilities() {
  const cached = readJson(CAP_FILE);
  if (
    cached?.capabilities &&
    Date.now() - (cached.fetchedAt ?? 0) < CAP_TTL_MS
  ) {
    return cached.capabilities;
  }

  try {
    const res = await fetch(process.env.CMD_MODELS_DOCS_URL || MODELS_DOCS_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const capabilities = parseCapabilities(await res.text());
    if (Object.keys(capabilities).length > 0) {
      writeJson(CAP_FILE, { fetchedAt: Date.now(), capabilities });
      return capabilities;
    }
    throw new Error("empty capability map");
  } catch {
    return cached?.capabilities ?? null;
  }
}

function buildCapIndex(capabilities) {
  const exact = capabilities ?? {};
  const norm = {};
  for (const [id, cap] of Object.entries(exact)) norm[normId(id)] = cap;
  return { exact, norm };
}

function lookupCapability(index, id) {
  if (index.exact[id]) return index.exact[id];
  const base = id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id;
  for (const key of [normId(id), normId(base)]) {
    if (index.norm[key]) return index.norm[key];
  }
  return null;
}

function resolveCapabilities(id, name, index) {
  // ① 代码内强制覆盖优先级最高（见 FORCE_TEXT_ONLY / FORCE_VISION）。
  if (hasHint(id, name, FORCE_TEXT_ONLY)) return { vision: false, reasoning: true };
  if (hasHint(id, name, FORCE_VISION)) return { vision: true, reasoning: true };

  // ② 文档同步结果（权威）。
  const doc = lookupCapability(index, id);
  if (doc) return doc;

  // ③ 关键词兜底。
  return {
    vision: hasHint(id, name, VISION_HINTS),
    reasoning: true,
  };
}

/* ------------------------------------------------------------------ */
/* 模态探测：上游字段优先，其余交给能力推断                              */
/* ------------------------------------------------------------------ */

const pickList = (value) => {
  if (!Array.isArray(value)) return null;
  const picked = [...new Set(value.filter((x) => MODALITY_KEYS.includes(x)))];
  return picked.length ? picked : null;
};

function upstreamModalities(model) {
  const input = pickList(
    model.architecture?.input_modalities ??
      model.modalities?.input ??
      model.input_modalities
  );
  if (!input) return null;
  const output = pickList(
    model.architecture?.output_modalities ??
      model.modalities?.output ??
      model.output_modalities
  );
  return { input, output: output ?? ["text"] };
}

/* ------------------------------------------------------------------ */
/* 模型列表加载                                                        */
/* ------------------------------------------------------------------ */

async function loadModelList() {
  try {
    const res = await fetch(BASE_URL + "/models", {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data?.data) && data.data.length > 0) {
      writeJson(CACHE_FILE, data);
      return data.data;
    }
    throw new Error("empty model list");
  } catch {
    const cached = readJson(CACHE_FILE);
    if (Array.isArray(cached?.data) && cached.data.length > 0) return cached.data;
    return null;
  }
}

function buildModels(items, capIndex) {
  const models = {};
  for (const m of [...items].sort((a, b) => a.id.localeCompare(b.id))) {
    const id = m.id;
    const name = m.name || id;
    const context = m.context_length || 128000;
    const caps = resolveCapabilities(id, name, capIndex);

    // 关键字段：显式声明输入模态，否则客户端一律按纯文本处理。
    const modalities =
      upstreamModalities(m) ??
      (caps.vision
        ? { input: ["text", "image"], output: ["text"] }
        : { input: ["text"], output: ["text"] });

    if (/^claude/i.test(id)) {
      const entry = {
        name,
        reasoning: caps.reasoning,
        limit: { context, output: 64000 },
        modalities,
        provider: { npm: "@ai-sdk/anthropic" },
      };
      if (caps.reasoning) {
        entry.variants = {
          "thinking-on": { thinking: { type: "enabled", budgetTokens: 16384 } },
          "thinking-off": {},
        };
      }
      models[id] = entry;
    } else {
      const entry = {
        name,
        reasoning: caps.reasoning,
        limit: { context, output: 32000 },
        modalities,
      };
      if (caps.reasoning) {
        entry.variants = {
          low: { reasoningEffort: "low" },
          medium: { reasoningEffort: "medium" },
          high: { reasoningEffort: "high" },
        };
      }
      models[id] = entry;
    }
  }
  return models;
}

/* ------------------------------------------------------------------ */
/* 鉴权                                                               */
/* ------------------------------------------------------------------ */

/* 环境变量里可用的 API key 名称，按优先级从高到低。 */
const API_KEY_ENV_VARS = [
  "CMD_API_KEY",
  "COMMANDCODE_API_KEY",
  "COMMAND_CODE_API_KEY",
  "CMDCODE_API_KEY",
];

function envApiKey() {
  for (const name of API_KEY_ENV_VARS) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  return undefined;
}

async function loadAuthOptions(getAuth) {
  let stored;
  try {
    const auth = await getAuth();
    stored = typeof auth === "string" ? auth : auth?.key;
  } catch {}
  const options = { baseURL: BASE_URL };
  // 环境变量显式优先；未设置时回退到凭据库中登录保存的 key。
  const apiKey = envApiKey() ?? (stored && stored.trim() ? stored.trim() : undefined);
  if (apiKey) options.apiKey = apiKey;
  return options;
}

/* ------------------------------------------------------------------ */
/* 插件入口（Kilo 与 OpenCode 使用同一份 Hooks 结构）                    */
/* ------------------------------------------------------------------ */

export const CommandCode = async () => ({
  config: async (config) => {
    const provider = (config.provider ??= {});
    const cmdcode = (provider.cmdcode ??= {});
    if (!cmdcode.npm) cmdcode.npm = "@ai-sdk/openai-compatible";
    if (!cmdcode.name) cmdcode.name = "Command Code";
    const opts = (cmdcode.options ??= {});
    if (!opts.baseURL) opts.baseURL = BASE_URL;
    // 环境变量可直接作为 apiKey 注入（无需 kilo auth login）。
    if (!opts.apiKey) {
      const envKey = envApiKey();
      if (envKey) opts.apiKey = envKey;
    }

    // 用户写在配置里的 provider.cmdcode.models 优先级更高：
    // 同 id 的用户条目与自动推断结果做“条目内顶层键合并”，
    // 因此无需改插件即可手工修正某个模型的模态/参数/变体等，
    // 同时保留自动生成的 name / limit / variants。
    const userModels = cmdcode.models ?? {};
    const [items, capabilities] = await Promise.all([
      loadModelList(),
      loadCapabilities(),
    ]);
    const built = buildModels(items ?? [], buildCapIndex(capabilities));
    const merged = { ...built };
    for (const [id, entry] of Object.entries(userModels)) {
      const base = merged[id];
      merged[id] = base ? { ...base, ...entry } : entry;
    }
    if (items || Object.keys(userModels).length > 0) cmdcode.models = merged;

    // 清理旧版遗留的静态 cmdcode-claude provider（若有）。
    delete provider["cmdcode-claude"];
  },
  auth: {
    provider: "cmdcode",
    loader: loadAuthOptions,
    methods: [{ type: "api", label: "Command Code" }],
  },
});

export default CommandCode;
