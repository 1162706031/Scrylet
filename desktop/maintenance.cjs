const fs = require("node:fs/promises");
const path = require("node:path");

async function directorySize(directory) {
  let size = 0;
  try {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) size += await directorySize(file);
      else if (entry.isFile()) size += (await fs.stat(file)).size;
    }
  } catch { /* Active browser caches can disappear while measuring. */ }
  return size;
}

class Maintenance {
  constructor(session, sessionDirectory, activity) {
    Object.assign(this, { session, sessionDirectory, activity });
    this.clearing = false;
  }
  async stats() {
    const [httpBytes, codeBytes] = await Promise.all([
      this.session.getCacheSize(), directorySize(path.join(this.sessionDirectory, "Code Cache")),
    ]);
    return { bytes: httpBytes + codeBytes, clearing: this.clearing };
  }
  async clearCache() {
    if (this.clearing) throw new Error("正在清理缓存，请稍候。");
    this.clearing = true;
    try {
      const before = await this.stats();
      // Deliberately exclude cookies, localStorage, IndexedDB and application data.
      await this.session.clearCache();
      await this.session.clearCodeCaches({});
      const after = await this.stats();
      const bytes = Math.max(0, before.bytes - after.bytes);
      this.activity.record("cache.cleared", { bytes });
      return { success: true, bytes, remainingBytes: after.bytes };
    } catch {
      this.activity.record("cache.failed");
      throw new Error("缓存未能全部清理，请稍后重试。聊天记录与设置不会被删除。");
    } finally {
      this.clearing = false;
    }
  }
}

module.exports = { Maintenance };
