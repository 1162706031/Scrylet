const fs = require("node:fs"),
  path = require("node:path");
const { dimensions, MAX_BYTES } = require("../files.cjs");
const {
  fail,
  digest,
  canonical,
  safeId,
  readFile,
  json,
} = require("./common.cjs");
function dataBytes(value) {
  const match =
    typeof value === "string" &&
    /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]*={0,2})$/.exec(
      value,
    );
  if (!match || match[2].length > MAX_BYTES * 1.4) fail();
  const bytes = Buffer.from(match[2], "base64");
  if (
    bytes.toString("base64") !== match[2] ||
    dimensions(bytes).mime !== match[1]
  )
    fail();
  return bytes;
}
function fileBytes(source, row) {
  if (typeof row.path === "string" && row.path.startsWith("data:"))
    return dataBytes(row.path);
  if (typeof row.path !== "string" || !row.path.length) fail();
  let file = path.resolve(row.path);
  const controlled =
    fs.existsSync(file) &&
    (() => {
      const r = path.relative(
        fs.realpathSync(source.root),
        fs.realpathSync(file),
      );
      return (
        r !== ".." && !r.startsWith(".." + path.sep) && !path.isAbsolute(r)
      );
    })();
  if (!controlled) {
    // Relocated userData: only an ID-prefixed basename in the controlled uploads
    // root is eligible. Never read arbitrary external DB paths or URLs.
    const name = path.win32.basename(row.path);
    if (!name.startsWith(row.id + "_") && !name.startsWith(row.id + "."))
      fail();
    file = path.join(source.root, "open-webui/uploads", name);
  }
  return readFile(source.root, file);
}
function sourceFiles(source) {
  return source.tables.file.map((row) => {
    const bytes = fileBytes(source, row),
      size = dimensions(bytes);
    if (
      bytes.length > MAX_BYTES ||
      !size.width ||
      !size.height ||
      size.width * size.height > 32000000
    )
      fail();
    const sha256 = digest(bytes),
      meta = json(row.meta, {});
    if (meta.file_hash && meta.file_hash !== sha256) fail();
    if (row.hash && row.hash !== sha256) fail();
    return {
      id: safeId(row.id),
      sourceId: row.id,
      bytes,
      sha256,
      ...size,
      name: row.filename,
      createdAt: require("./common.cjs").milliseconds(row.created_at),
      raw: row,
    };
  });
}
function reference(value, files) {
  if (!value || typeof value !== "object") fail();
  const nested = value.file && typeof value.file === "object" ? value.file : {};
  const url =
    typeof value.url === "string"
      ? value.url
      : typeof nested.url === "string"
        ? nested.url
        : "";
  if (url.startsWith("data:")) {
    const bytes = dataBytes(url),
      id = "inline_" + digest(bytes),
      existing = files.find((f) => f.id === id);
    if (!existing) {
      const size = dimensions(bytes);
      files.push({
        id,
        sourceId: id,
        bytes,
        sha256: digest(bytes),
        ...size,
        name: typeof value.name === "string" ? value.name : "旧图片",
        createdAt: 0,
        raw: { inline: true },
      });
    }
    return id;
  }
  if (/^(?:https?:|blob:|\/\/)/i.test(url)) fail();
  const match = /^\/api\/v1\/files\/([A-Za-z0-9_-]+)\/content$/.exec(url),
    id =
      match?.[1] ||
      (url && /^[A-Za-z0-9_-]+$/.test(url)
        ? url
        : !url
          ? value.id || nested.id
          : null);
  const file = files.find((f) => f.sourceId === id || f.id === id);
  if (!file) fail();
  return file.id;
}
function mapFilesAndPrompts(storage, files) {
  for (const f of files) {
    require("../../contracts/validate.cjs").validate("file", {
      apiVersion: 1,
      id: f.id,
      name: f.name,
      mime: f.mime,
      bytes: f.bytes.length,
      width: f.width,
      height: f.height,
      sha256: f.sha256,
      createdAt: f.createdAt,
    });
    const relative = f.id + ".image",
      final = path.join(storage.root, "files", relative),
      pending = final + ".pending";
    if (fs.existsSync(final)) {
      if (digest(readFile(storage.root, final)) !== f.sha256) fail();
    } else {
      if (fs.existsSync(pending)) {
        if (digest(readFile(storage.root, pending)) !== f.sha256) fail();
      } else fs.writeFileSync(pending, f.bytes, { flag: "wx", mode: 0o600 });
      fs.renameSync(pending, final);
    }
    storage.transaction(() => {
      storage.db
        .prepare(
          "INSERT OR IGNORE INTO files(id,path,sha256,mime,bytes,width,height,name,created_at,legacy) VALUES(?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          f.id,
          relative,
          f.sha256,
          f.mime,
          f.bytes.length,
          f.width,
          f.height,
          f.name,
          f.createdAt,
          canonical(f.raw),
        );
      storage.db
        .prepare("INSERT OR IGNORE INTO legacy_ids VALUES('file',?,?,?)")
        .run(f.sourceId, f.id, f.sha256);
      const row = storage.db
        .prepare("SELECT * FROM files WHERE id=?")
        .get(f.id);
      if (row.sha256 !== f.sha256 || row.bytes !== f.bytes.length) fail();
    });
  }
}
module.exports = {
  dataBytes,
  fileBytes,
  sourceFiles,
  reference,
  mapFilesAndPrompts,
};
