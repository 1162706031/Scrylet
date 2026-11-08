const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { validate, ContractError } = require("../contracts/validate.cjs");
const MAX_BYTES = 20 * 1024 * 1024;
function dimensions(bytes) {
  if (bytes.length < 12) throw new ContractError();
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.length >= 33) {
    let offset = 8, ended = false, idat = false;
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset), type = bytes.toString("ascii", offset + 4, offset + 8);
      if (offset + length + 12 > bytes.length) throw new ContractError();
      if (type === "IDAT") idat = true;
      offset += length + 12;
      if (type === "IEND") { ended = true; break; }
    }
    if (!ended || !idat || offset !== bytes.length || bytes.toString("ascii", 12, 16) !== "IHDR") throw new ContractError();
    return { mime: "image/png", width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes[0] === 255 && bytes[1] === 216 && bytes.at(-2) === 255 && bytes.at(-1) === 217) {
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset++] !== 255) throw new ContractError();
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++], length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) throw new ContractError();
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker) && length >= 7)
        return { mime: "image/jpeg", width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
      offset += length;
    }
  }
  if (/^GIF8[79]a$/.test(bytes.toString("ascii",0,6)) && bytes.at(-1) === 59)
    return { mime: "image/gif", width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  if (bytes.toString("ascii",0,4) === "RIFF" && bytes.toString("ascii",8,12) === "WEBP" && bytes.readUInt32LE(4) + 8 === bytes.length) {
    const kind = bytes.toString("ascii",12,16);
    if (kind === "VP8X" && bytes.length >= 30) return { mime: "image/webp", width: 1 + bytes.readUIntLE(24,3), height: 1 + bytes.readUIntLE(27,3) };
    if (kind === "VP8 " && bytes.length >= 30 && bytes.subarray(23,26).equals(Buffer.from([157,1,42]))) return { mime: "image/webp", width: bytes.readUInt16LE(26) & 16383, height: bytes.readUInt16LE(28) & 16383 };
    if (kind === "VP8L" && bytes.length >= 25 && bytes[20] === 47) { const bits = bytes.readUInt32LE(21); return { mime: "image/webp", width: 1 + (bits & 16383), height: 1 + ((bits >>> 14) & 16383) }; }
  }
  throw new ContractError();
}
class Files {
  constructor(storage) { this.storage = storage; this.db = storage.db; this.root = path.join(storage.root, "files"); }
  put(bytes, { name, mime }) {
    if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > MAX_BYTES) throw new ContractError("TOO_LARGE", 413);
    const size = dimensions(bytes);
    if (size.mime !== mime || !size.width || !size.height || size.width > 16384 || size.height > 16384 || size.width * size.height > 32000000) throw new ContractError();
    const value = validate("file", { apiVersion: 1, id: crypto.randomUUID(), name, ...size, bytes: bytes.length,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"), createdAt: Date.now() });
    const relative = value.id + ".image", final = path.join(this.root, relative), temporary = final + ".pending";
    fs.writeFileSync(temporary, bytes, { flag: "wx", mode: 0o600 }); fs.renameSync(temporary, final);
    try {
      this.storage.transaction(() => {
        this.db.prepare("INSERT INTO files(id,path,sha256,mime,bytes,width,height,name,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
          .run(value.id, relative, value.sha256, value.mime, value.bytes, value.width, value.height, value.name, value.createdAt);
        // Explicit stable mapping for browser rollback drafts; the compatibility
        // route still refuses every unmapped ID instead of guessing a path.
        this.db.prepare("INSERT INTO legacy_ids VALUES('file',?,?,?)").run(value.id, value.id, value.sha256);
      });
    } catch (error) { fs.renameSync(final, temporary); throw error; }
    return value;
  }
  /** @param {string} id @returns {import('../contracts/index').Attachment} */
  get(id) {
    const row = this.db.prepare("SELECT * FROM files WHERE id=?").get(id);
    if (!row) throw new ContractError("NOT_FOUND", 404);
    return validate("file", { apiVersion: 1, id: row.id, name: row.name, mime: row.mime, bytes: row.bytes, width: row.width, height: row.height, sha256: row.sha256, createdAt: row.created_at });
  }
  read(id) {
    const value = this.get(id), row = this.db.prepare("SELECT path FROM files WHERE id=?").get(id);
    if (row.path !== id + ".image") throw new ContractError("STORAGE_FAILED", 503);
    const file = path.join(this.root, row.path);
    let bytes;
    try { if (fs.lstatSync(file).isSymbolicLink()) throw Error(); bytes = fs.readFileSync(file); } catch { throw new ContractError("NOT_FOUND", 404); }
    if (bytes.length !== value.bytes || crypto.createHash("sha256").update(bytes).digest("hex") !== value.sha256) throw new ContractError("STORAGE_FAILED", 503);
    return { value, bytes };
  }
}
module.exports = { Files, MAX_BYTES, dimensions };
