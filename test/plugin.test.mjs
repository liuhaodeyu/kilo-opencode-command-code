import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pluginDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

// 去掉可能存在的真实缓存，保证测试走 stub，结果确定。
for (const file of [".cache.json", ".capabilities.json"]) {
  try {
    fs.unlinkSync(path.join(pluginDir, file));
  } catch {}
}

const MODELS = {
  object: "list",
  data: [
    {
      id: "deepseek/deepseek-v4.1-flash",
      object: "model",
      name: "DeepSeek V4.1 Flash",
      context_length: 1000000,
    },
    {
      id: "deepseek/deepseek-v4-flash",
      object: "model",
      name: "DeepSeek V4 Flash (latest)",
      context_length: 1000000,
    },
    {
      id: "claude-opus-5",
      object: "model",
      name: "Claude Opus 5",
      context_length: 200000,
    },
  ],
};

const DOCS_HTML = `
<tr>
  <td><code>deepseek/deepseek-v4.1-flash</code></td>
  <td><span aria-label="Capabilities: Text input, Vision, Reasoning"></span></td>
</tr>
<tr>
  <td><code>deepseek/deepseek-v4-flash</code></td>
  <td><span aria-label="Capabilities: Text input, Reasoning"></span></td>
</tr>
<tr>
  <td><code>claude-opus-5</code></td>
  <td><span aria-label="Capabilities: Text input, Vision, Reasoning"></span></td>
</tr>
`;

globalThis.fetch = async (url) => {
  const target = String(url);
  if (target.includes("api.commandcode.ai")) {
    return new Response(JSON.stringify(MODELS), { status: 200 });
  }
  return new Response(DOCS_HTML, { status: 200 });
};

// 插件只在“已连接”时注册模型；测试里用环境变量模拟已连接。
process.env.CMD_API_KEY = "test-env-key";

const { CommandCode } = await import("../index.js");
const plugin = await CommandCode();
const config = {};
await plugin.config(config);
const models = config.provider.cmdcode.models;

test("registers the cmdcode provider with the Command Code base URL", () => {
  assert.equal(
    config.provider.cmdcode.options.baseURL,
    "https://api.commandcode.ai/provider/v1"
  );
  assert.equal(config.provider.cmdcode.name, "Command Code");
});

test("auto-syncs every model from the provider API", () => {
  assert.deepEqual(
    Object.keys(models).sort(),
    [
      "claude-opus-5",
      "deepseek/deepseek-v4-flash",
      "deepseek/deepseek-v4.1-flash",
    ]
  );
});

test("derives vision modality from the official capability table", () => {
  assert.deepEqual(
    models["deepseek/deepseek-v4.1-flash"].modalities.input,
    ["text", "image"]
  );
  assert.deepEqual(models["deepseek/deepseek-v4-flash"].modalities.input, [
    "text",
  ]);
  assert.equal(models["deepseek/deepseek-v4.1-flash"].attachment, true);
  assert.equal(models["deepseek/deepseek-v4-flash"].attachment, false);
});

test("routes Claude models to the Anthropic endpoint with thinking variants", () => {
  assert.equal(models["claude-opus-5"].provider.npm, "@ai-sdk/anthropic");
  assert.ok(models["claude-opus-5"].variants["thinking-on"]);
});

test("adds reasoning effort variants for non-Claude models", () => {
  assert.ok(models["deepseek/deepseek-v4.1-flash"].variants.low);
  assert.ok(models["deepseek/deepseek-v4.1-flash"].variants.high);
});

test("reads the API key from CMD_API_KEY when no stored auth exists", async () => {
  const previous = process.env.CMD_API_KEY;
  process.env.CMD_API_KEY = "test-env-key";
  try {
    const options = await plugin.auth.loader(async () => undefined);
    assert.equal(options.apiKey, "test-env-key");
    assert.equal(options.baseURL, "https://api.commandcode.ai/provider/v1");
  } finally {
    if (previous === undefined) delete process.env.CMD_API_KEY;
    else process.env.CMD_API_KEY = previous;
  }
});

test("does not register models until the user has connected", async () => {
  const names = [
    "CMD_API_KEY",
    "COMMANDCODE_API_KEY",
    "COMMAND_CODE_API_KEY",
    "CMDCODE_API_KEY",
  ];
  const previous = Object.fromEntries(names.map((n) => [n, process.env[n]]));
  for (const n of names) delete process.env[n];
  try {
    const config = {};
    await plugin.config(config);
    assert.equal(config.provider.cmdcode.models, undefined);
    assert.equal(
      config.provider.cmdcode.options.baseURL,
      "https://api.commandcode.ai/provider/v1"
    );
  } finally {
    for (const n of names) {
      if (previous[n] === undefined) delete process.env[n];
      else process.env[n] = previous[n];
    }
  }
});
