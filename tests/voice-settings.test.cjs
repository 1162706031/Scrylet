const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../web/voice-settings.js"), "utf8");
const adapter = import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));

test("同地区自动优先增强或自然音色，不依赖系统列表顺序", async () => {
  const { chooseVoice } = await adapter;
  const voices = [{ name: "基础声音", lang: "zh-CN", default: true },
    { name: "English Natural Premium", lang: "en-US" },
    { name: "中文（增强）", lang: "zh-CN" }];
  assert.equal(chooseVoice(voices), voices[2]);
  assert.equal(chooseVoice([...voices].reverse()), voices[2]);
  assert.equal(chooseVoice(voices, "", "en-US"), voices[1]);
});

test("优先普通话地区匹配，识别 cmn 与下划线语言代码", async () => {
  const { chooseVoice } = await adapter;
  const voices = [{ name: "English Premium", lang: "en-US" },
    { name: "Cantonese Natural", lang: "zh-HK" },
    { name: "国语 Premium", lang: "zh-TW" },
    { name: "普通话", lang: "cmn-Hans-CN" }];
  assert.equal(chooseVoice(voices), voices[3]);
  const mainland = { name: "大陆中文", lang: "zh_CN" };
  assert.equal(chooseVoice([...voices.slice(0, 3), mainland]), mainland);
});

test("手选声音覆盖自动优选；暂不可用时回退，不选不匹配的语言", async () => {
  const { chooseVoice, voiceKey } = await adapter;
  const basic = { name: "基础声音", lang: "zh-CN", voiceURI: "voice:basic" };
  const premium = { name: "自然声音 Premium", lang: "zh-CN", voiceURI: "voice:premium" };
  assert.equal(chooseVoice([basic, premium], voiceKey(basic)), basic);
  assert.equal(chooseVoice([basic, premium], "voice:removed"), premium);
  assert.equal(chooseVoice([{ name: "English only", lang: "en-US" }]), null);
  assert.equal(chooseVoice([]), null);
});

test("保存的语速只接受舒适区间，非法值恢复默认语速", async () => {
  const { speechRate } = await adapter;
  for (const value of [null, "", "NaN", "Infinity", -1, 0, 2]) assert.equal(speechRate(value), 0.95);
  for (const value of [0.8, 0.95, 1, 1.2]) assert.equal(speechRate(String(value)), value);
});

test("同名音色可从系统 URI 识别增强版，并给选择项补充质量标识", async () => {
  const { chooseVoice, voiceLabel } = await adapter;
  const basic = { name: "同名声音", lang: "zh-CN", voiceURI: "system.voice.basic.zh-CN" };
  const premium = { name: "同名声音", lang: "zh-CN", voiceURI: "system.voice.premium.zh-CN" };
  assert.equal(chooseVoice([basic, premium]), premium);
  assert.equal(voiceLabel(basic), "同名声音");
  assert.equal(voiceLabel(premium), "同名声音 · 高品质");
});
