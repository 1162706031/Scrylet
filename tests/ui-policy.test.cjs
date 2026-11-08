const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
test("静默桥拦截通知、媒体与振动，手机只有显式开启后才朗读，重复加载不重置", async () => {
  class Media { play() { throw Error("audible"); } }
  class Source { start() { throw Error("audible"); } }
  let spoken = 0;
  const synthesis = { speak() { spoken++; }, cancel() {} };
  const context = {
    HTMLMediaElement: Media, AudioScheduledSourceNode: Source,
    EventTarget, Event, document: { hidden: false },
    navigator: { userAgent: "iPhone", vibrate() { throw Error("vibration"); } },
    speechSynthesis: synthesis, SpeechSynthesisUtterance: class {}, Notification: class {},
  };
  context.window = context;
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, "../web/quiet.js"), "utf8");
  vm.runInContext(source, context);
  const media = new Media(); await media.play(); assert.equal(media.muted, true);
  new Source().start();
  assert.equal(context.navigator.vibrate(), false);
  assert.equal(await context.Notification.requestPermission(), "denied");
  synthesis.speak({}); context.__snapReadAloud.speak({}); assert.equal(spoken, 0);
  context.__snapReadAloud.enable(true); context.__snapReadAloud.speak({}); assert.equal(spoken, 1);
  vm.runInContext(source, context); context.__snapReadAloud.speak({}); assert.equal(spoken, 2);
  context.document.hidden = true; context.__snapReadAloud.speak({}); assert.equal(spoken, 2);
  context.__snapReadAloud.enable(false); context.document.hidden = false;
  context.__snapReadAloud.speak({}); assert.equal(spoken, 2);
});
