const test = require("node:test");
const assert = require("node:assert/strict");
const { CaptureDelivery } = require("../desktop/capture-delivery.cjs");

const device = { id: "phone-1", name: "测试手机" };
const data = { clientId: "phone-page-00000001", context: "/:0", ready: true, active: true };
const picture = { image: "data:image/jpeg;base64,dGVzdA==" };

test("桌面截图只交付指定页面一次，其他设备不能认领或确认", async () => {
  const delivery = new CaptureDelivery();
  delivery.poll(device, data);
  const target = delivery.target();
  const sent = delivery.send(target, picture, "默认提示词", { showCaptureHints: true });
  delivery.poll({ id: "phone-2", name: "另一台手机" }, { ...data, clientId: "phone-page-00000002", claim: true });
  assert.equal(delivery.selected, data.clientId);
  const { command } = delivery.poll(device, data);
  assert.equal(command.prompt, "默认提示词");
  assert.equal(command.image, picture.image);
  assert.equal(command.showCaptureHints, false);
  assert.equal(delivery.poll(device, data).command, null);
  assert.throws(() => delivery.send(target, picture, "重复"), /正在发送/);
  assert.throws(() => delivery.acknowledge({ id: "phone-2" }, { ...data, id: command.id, success: true }), /失效/);
  delivery.acknowledge(device, { ...data, id: command.id, success: true });
  assert.deepEqual(await sent, { success: true, name: "测试手机" });
  assert.throws(() => delivery.acknowledge(device, { ...data, id: command.id, success: true }), /失效/);
  delivery.close();
});

test("离线、后台、草稿和生成中不接收截图，切换对话会取消待交付指令", async () => {
  let now = 0;
  const delivery = new CaptureDelivery(() => now);
  assert.throws(() => delivery.target(), /保持聊天页面/);
  for (const reason of ["draft", "generating", "hidden"]) {
    delivery.poll(device, { ...data, ready: false, reason });
    assert.equal(delivery.status().ready, false);
    assert.throws(() => delivery.target());
  }
  delivery.poll(device, data);
  const pending = delivery.send(delivery.target(), picture, "提示词");
  const rejected = assert.rejects(pending, /对话已切换/);
  assert.equal(delivery.poll(device, { ...data, context: "/c/other:1" }).command, null);
  await rejected;
  now = 4001;
  assert.equal(delivery.status().connected, false);
  assert.throws(() => delivery.target(), /保持聊天页面/);
  delivery.close();
});

test("暂停、撤销及超时失效的截图不能再确认或重放", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  const delivery = new CaptureDelivery();
  delivery.poll(device, data);
  let sent = delivery.send(delivery.target(), picture, "提示词");
  let rejected = assert.rejects(sent, /取消/);
  const command = delivery.poll(device, data).command;
  delivery.cancel();
  await rejected;
  assert.throws(() => delivery.validate(device, { ...data, id: command.id }), /失效/);
  sent = delivery.send(delivery.target(), picture, "提示词");
  rejected = assert.rejects(sent, /取消配对/);
  delivery.revoke(device.id);
  await rejected;
  delivery.poll(device, data);
  sent = delivery.send(delivery.target(), picture, "提示词");
  rejected = assert.rejects(sent, /未接收/);
  t.mock.timers.tick(25001);
  await rejected;
  delivery.poll(device, data);
  assert.equal(delivery.poll(device, data).command, null);
  delivery.close();
});
