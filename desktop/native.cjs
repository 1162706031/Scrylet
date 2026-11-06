const os = require("node:os");

function networkPriority({ name, address }) {
  const [first, second] = address.split(".").map(Number);
  const privateAddress = first === 10 || (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168);
  // Adapter names alone miss proxy TUN interfaces that present as Ethernet.
  const benchmark = first === 198 && (second === 18 || second === 19);
  const virtual = /utun|docker|vmnet|vEthernet|bridge|virtual|vmware|vbox|hyper-v|wsl|loopback|vpn|wireguard|tailscale|zerotier|clash|mihomo|sing[- _]?box|\bmeta\b|(?:^|[\s(_-])(?:tun|tap|wg)\d*(?:$|[\s)_-])/i.test(name);
  const linkLocal = first === 169 && second === 254;
  return (linkLocal ? 200 : virtual || benchmark ? 100 : 0) + (privateAddress ? 0 : 1);
}

function addresses(interfaces = os.networkInterfaces()) {
  return Object.entries(interfaces)
    .flatMap(([name, entries]) =>
      (entries || [])
        .filter((item) => (item.family === "IPv4" || item.family === 4) && !item.internal)
        .map((item) => ({ name, address: item.address })),
    )
    .sort((a, b) => networkPriority(a) - networkPriority(b));
}

function createNative(electron) {
  const { desktopCapturer, screen, systemPreferences, shell, clipboard } =
    electron;
  let capturing = false;
  function permission() {
    return process.platform === "darwin"
      ? systemPreferences.getMediaAccessStatus("screen")
      : "granted";
  }
  function displays() {
    const primary = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map((item, index) => ({
      id: String(item.id),
      name: item.label || "屏幕 " + (index + 1),
      width: item.size.width,
      height: item.size.height,
      primary: item.id === primary,
    }));
  }
  async function capture(displayId, region) {
    if (capturing) throw new Error("正在截屏，请稍候");
    capturing = true;
    try {
      const display =
        screen
          .getAllDisplays()
          .find((item) => String(item.id) === String(displayId)) ||
        screen.getPrimaryDisplay();
      const scale = region ? 1 : Math.min(
        1,
        2560 /
          Math.max(
            display.size.width * display.scaleFactor,
            display.size.height * display.scaleFactor,
          ),
      );
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: {
          width: Math.round(display.size.width * display.scaleFactor * scale),
          height: Math.round(display.size.height * display.scaleFactor * scale),
        },
      });
      if (permission() !== "granted") {
        throw new Error("请在电脑 App 中开启屏幕录制权限，然后重启 App");
      }
      const source = sources.find(
        (item) => item.display_id === String(display.id),
      );
      if (!source || source.thumbnail.isEmpty())
        throw new Error("暂时无法读取屏幕，请确认电脑已解锁且显示器已连接");
      let thumbnail = source.thumbnail;
      if (region) {
        const size = thumbnail.getSize();
        const x = Math.max(0, Math.round((region.x - display.bounds.x) * size.width / display.size.width));
        const y = Math.max(0, Math.round((region.y - display.bounds.y) * size.height / display.size.height));
        const right = Math.min(size.width, Math.round((region.x + region.width - display.bounds.x) * size.width / display.size.width));
        const bottom = Math.min(size.height, Math.round((region.y + region.height - display.bounds.y) * size.height / display.size.height));
        if (right <= x || bottom <= y) throw new Error("选区无效，请重新选择");
        thumbnail = thumbnail.crop({ x, y, width: right - x, height: bottom - y });
        const cropped = thumbnail.getSize();
        if (Math.max(cropped.width, cropped.height) > 2560) thumbnail = thumbnail.resize(
          cropped.width >= cropped.height ? { width: 2560 } : { height: 2560 },
        );
      }
      const size = thumbnail.getSize();
      return {
        image:
          "data:image/jpeg;base64," +
          thumbnail.toJPEG(92).toString("base64"),
        width: size.width,
        height: size.height,
        displayId: String(display.id),
      };
    } finally {
      capturing = false;
    }
  }
  return {
    permission,
    displays,
    capture,
    captureRegion: async (first, second) => {
      if (![first?.x, first?.y, second?.x, second?.y].every(Number.isFinite) ||
          second.x - first.x < 16 || second.y - first.y < 16)
        throw new Error("请先选择左上角，再选择右下角；选区至少 16 × 16");
      const display = screen.getDisplayNearestPoint(first);
      const { x, y, width, height } = display.bounds;
      if (first.x < x || first.y < y || second.x > x + width || second.y > y + height)
        throw new Error("两个角需要在同一块屏幕内");
      return capture(String(display.id), {
        x: first.x, y: first.y, width: second.x - first.x, height: second.y - first.y,
      });
    },
    async openPermission() {
      if (process.platform === "darwin") {
        await shell.openExternal(
          "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
        );
      }
    },
    copy(text) {
      clipboard.writeText(String(text));
    },
  };
}
module.exports = { createNative, addresses };
