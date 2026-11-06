const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const adapter = import(pathToFileURL(path.join(__dirname, "../web/read-aloud.js")));

test("朗读正文去除格式标记并保留标题、链接文字、公式和代码内容", async () => {
  const { speechText } = await adapter;
  const text = speechText('# 解答\n\n<think>不要朗读推理草稿</think>\n**结果**是 $c = 5$。\n[参考说明](https://example.test)\n~~~python\nprint(5)\n~~~');
  assert.equal(text, '解答\n\n结果是 c = 5。\n参考说明\nprint(5)');
});

test("长回答按短句分段且不丢失正文或切断表情字符", async () => {
  const { speechChunks } = await adapter;
  const text = "这是一段很长的解答🙂".repeat(100) + "。第二步！最后一步？";
  const chunks = speechChunks(text);
  assert.equal(chunks.join(""), text);
  assert.ok(chunks.every(chunk => Array.from(chunk).length <= 160));
  assert.ok(chunks.every(chunk => !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(chunk)));
});

test("空回答和纯格式内容没有可朗读文本", async () => {
  const { speechText, speechChunks } = await adapter;
  assert.deepEqual(speechChunks(speechText("\n~~~\n~~~\n")), []);
  assert.equal(speechText(null), "");
});

test("比较符号与小数保留原义，不把小数拆成两个句子", async () => {
  const { speechText, speechChunks } = await adapter;
  assert.equal(speechText("当 a < b 且 c > d 时，**结果**是 3.14。"), "当 a < b 且 c > d 时，结果是 3.14。");
  assert.deepEqual(speechChunks("The answer is 3.14. Next step!"), ["The answer is 3.14. Next step!"]);
});

test("同段的短句交给同一次合成，让语音引擎按标点自然停顿", async () => {
  const { speechChunks } = await adapter;
  assert.deepEqual(speechChunks("你好。我们慢慢来。先看第一步！"), ["你好。我们慢慢来。先看第一步！"]);
});
