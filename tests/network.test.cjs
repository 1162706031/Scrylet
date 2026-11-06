const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const QRCode = require("qrcode");
const { addresses } = require("../desktop/native.cjs");
const { Gateway } = require("../desktop/gateway.cjs");

const entry = (address) => [{ address, family: "IPv4", internal: false }];
const fixture = () => ({
  Meta: entry("198.18.0.1"),
  "vEthernet (WSL)": entry("172.27.32.1"),
  "WireGuard Tunnel": entry("10.8.0.2"),
  WLAN: entry("192.168.5.13"),
});

test("二维码默认使用局域网地址，Meta、TUN、VPN 和虚拟网卡仍可手动选择", () => {
  const networks = addresses(fixture());
  assert.equal(networks[0].name, "WLAN");
  assert.equal(networks.length, 4);
  assert.equal(addresses({ Ethernet: entry("198.19.0.1"), WLAN: entry("192.168.5.13") })[0].name, "WLAN");
  for (const name of ["Meta", "Clash", "Mihomo", "sing-box", "TUN", "tun0", "TAP-Windows Adapter", "utun2", "Tailscale", "ZeroTier", "VMware", "VirtualBox"]) {
    assert.equal(addresses({ [name]: entry("10.1.0.1"), WLAN: entry("192.168.5.13") })[0].name, "WLAN", name);
  }
  assert.equal(addresses({ Meta: entry("198.18.0.1"), Ethernet: entry("203.0.113.2") })[0].name, "Ethernet");
  assert.equal(addresses({ Ethernet: entry("169.254.1.2"), WLAN: entry("192.168.5.13") })[0].name, "WLAN");
  assert.deepEqual(addresses({ lo: [{ address: "127.0.0.1", family: "IPv4", internal: true }], WLAN: [{ address: "fe80::1", family: "IPv6", internal: false }] }), []);
});

function setup(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "snap-network-"));
  let interfaces = fixture();
  t.mock.method(os, "networkInterfaces", () => interfaces);
  const native = { permission: () => "granted", displays: () => [] };
  const create = () => new Gateway(directory, native, { ready: true });
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { directory, create, setInterfaces: (value) => { interfaces = value; } };
}

test("手动切换更新二维码和地址，重启保留网卡及端口，旧的端口配置兼容", async (t) => {
  const { directory, create } = setup(t);
  const first = create();
  await first.start();
  let second;
  t.after(async () => { await second?.close(); await first.close(); });
  const initial = await first.state();
  assert.equal(initial.selectedAddress, "192.168.5.13");
  assert.equal(new URL(initial.pairingUrl).origin, initial.baseUrl);
  const savedBefore = fs.readFileSync(first.networkFile, "utf8");
  assert.throws(() => first.selectNetwork("192.168.5.99"), /已失效/);
  assert.equal(fs.readFileSync(first.networkFile, "utf8"), savedBefore);
  first.selectNetwork("198.18.0.1");
  const selected = await first.state();
  assert.equal(selected.selectedAddress, "198.18.0.1");
  assert.equal(new URL(selected.pairingUrl).origin, selected.baseUrl);
  assert.notEqual(selected.qr, initial.qr);
  await first.close();
  second = create();
  await second.start();
  assert.equal(second.port, first.port);
  assert.equal((await second.state()).selectedAddress, "198.18.0.1");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, "network.json"))).selectedNetwork, { name: "Meta", address: "198.18.0.1" });
});

test("所选网卡 DHCP 地址变化时重新匹配，断开时临时回退，恢复后继续使用", async (t) => {
  const { create, setInterfaces } = setup(t);
  const gateway = create();
  await gateway.start();
  t.after(() => gateway.close());
  gateway.selectNetwork("192.168.5.13");
  setInterfaces({ ...fixture(), WLAN: entry("192.168.6.15") });
  assert.equal((await gateway.state()).selectedAddress, "192.168.6.15");
  setInterfaces({ Ethernet: entry("192.168.7.2") });
  assert.equal((await gateway.state()).selectedAddress, "192.168.7.2");
  setInterfaces({});
  assert.equal((await gateway.state()).selectedAddress, "127.0.0.1");
  setInterfaces(fixture());
  assert.equal((await gateway.state()).selectedAddress, "192.168.5.13");
});

test("网卡切换与状态刷新并发时，每份二维码始终与同份连接地址一致", async (t) => {
  const { create } = setup(t);
  const gateway = create();
  await gateway.start();
  t.after(() => gateway.close());
  let release;
  const wait = new Promise((resolve) => { release = resolve; });
  t.mock.method(QRCode, "toDataURL", async (url) => {
    if (new URL(url).hostname === "192.168.5.13") await wait;
    return new URL(url).origin;
  });
  const previous = gateway.state();
  gateway.selectNetwork("198.18.0.1");
  const current = await gateway.state();
  release();
  const original = await previous;
  for (const state of [original, current]) {
    assert.equal(state.qr, state.baseUrl);
    assert.equal(new URL(state.baseUrl).hostname, state.selectedAddress);
    assert.equal(new URL(state.pairingUrl).origin, state.baseUrl);
  }
});
