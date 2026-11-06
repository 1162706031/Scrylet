const path = require("node:path");
const { readJson } = require("./pairing.cjs");

function defaults(legacyDirectory) {
  const seeds = require("../config/prompts.json");
  const legacy = readJson(path.join(legacyDirectory, "prompts.json"), {});
  return {
    fullShortcut: "Ctrl+Alt+S",
    regionShortcut: "Ctrl+Alt+A",
    cancelShortcut: "Escape",
    mouseEnabled: process.platform === "win32",
    mouseButton: "left",
    doubleClickEnabled: false,
    doubleClickMs: 500,
    holdMs: 1200,
    timeoutMs: 5000,
    showCaptureHints: false,
    prompt: legacy.a_default?.content || seeds.a_default.content,
  };
}

function validateSettings(data) {
  if (!data || typeof data !== "object") throw new Error("截图设置无效");
  const result = {};
  for (const field of ["fullShortcut", "regionShortcut", "cancelShortcut"]) {
    if (typeof data[field] !== "string" || !data[field].trim() || data[field].length > 100)
      throw new Error("请为全屏、区域和取消操作设置快捷键");
    result[field] = data[field].trim();
  }
  const normalized = [result.fullShortcut, result.regionShortcut, result.cancelShortcut]
    .map((value) => value.toLowerCase().replace(/commandorcontrol|control|cmdorctrl/g, "ctrl").replace(/\s/g, ""));
  if (new Set(normalized).size !== 3) throw new Error("三个操作的快捷键不能相同");
  for (const [field, minimum, maximum] of [
    ["holdMs", 300, 5000], ["timeoutMs", 1000, 30000], ["doubleClickMs", 150, 1000],
  ]) {
    if (!Number.isInteger(data[field]) || data[field] < minimum || data[field] > maximum)
      throw new Error("长按、超时或双击间隔不在允许范围内");
    result[field] = data[field];
  }
  if (!["left", "right", "middle", "x1", "x2"].includes(data.mouseButton))
    throw new Error("请选择有效的鼠标按键");
  result.mouseButton = data.mouseButton;
  for (const field of ["mouseEnabled", "doubleClickEnabled"]) {
    if (typeof data[field] !== "boolean") throw new Error("鼠标开关无效");
    result[field] = data[field];
  }
  if (data.showCaptureHints !== undefined && typeof data.showCaptureHints !== "boolean")
    throw new Error("截图提示开关无效");
  // Retain the compatibility field, but old saved opt-ins cannot enable feedback.
  result.showCaptureHints = false;
  if (typeof data.prompt !== "string" || !data.prompt.trim() || data.prompt.length > 12000)
    throw new Error("请填写默认提示词（最多 12000 字）");
  result.prompt = data.prompt.trim();
  return result;
}

module.exports = { defaults, validateSettings };
