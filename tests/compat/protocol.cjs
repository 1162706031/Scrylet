const path = require("node:path");

function validateInitialize(value) {
  if (!value || value.protocolVersion !== 1 || value.type !== "initialize" ||
      !["probe", "hold"].includes(value.mode) || typeof value.directory !== "string" ||
      value.directory.length > 4096 || value.directory.includes("\0") || !path.isAbsolute(value.directory) ||
      !Number.isSafeInteger(value.parentPid) || value.parentPid <= 0 ||
      typeof value.secret !== "string" || value.secret.length < 16 || value.secret.length > 256)
    throw new Error("COMPAT_INITIALIZE_INVALID");
  let url;
  try { url = new URL(value.baseURL); } catch { throw new Error("COMPAT_INITIALIZE_INVALID"); }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.pathname !== "/v1" ||
      url.username || url.password || url.search || url.hash) throw new Error("COMPAT_INITIALIZE_INVALID");
  return value;
}

function isShutdown(value) { return value?.protocolVersion === 1 && value.type === "shutdown"; }
module.exports = { validateInitialize, isShutdown };
