const { validate, ContractError } = require("../contracts/validate.cjs");
class Prompts {
  constructor(storage) { this.storage = storage; this.db = storage.db; }
  seed(seeds = require("../config/prompts.json")) {
    this.storage.transaction(() => {
      if (this.db.prepare("SELECT 1 FROM product_state WHERE key='prompt-seeds'").get()) return;
      for (const [key, prompt] of Object.entries(seeds)) {
        const command = "/snap-" + key.replace(/[^a-zA-Z0-9_-]/g, "-");
        this.db.prepare("INSERT OR IGNORE INTO prompts(id,command,name,content,updated_at) VALUES(?,?,?,?,?)")
          .run(require("./migrations/common.cjs").safeId("seed_" + key), command, prompt.name, prompt.content, Date.now());
      }
      this.db.prepare("INSERT INTO product_state VALUES('prompt-seeds','1')").run();
    });
  }
  list() { return this.db.prepare("SELECT id,command,name,content,updated_at AS updatedAt FROM prompts ORDER BY command").all().map(v => validate("prompt", v)); }
  /** @param {unknown} value @returns {import('../contracts/index').Prompt} */
  save(value) {
    const v = validate("promptChange", value);
    return this.storage.transaction(() => {
      const old = this.db.prepare("SELECT * FROM prompts WHERE id=?").get(v.id);
      if (old && v.expectedUpdatedAt !== old.updated_at) throw new ContractError("VERSION_CONFLICT", 409);
      if (this.db.prepare("SELECT 1 FROM prompts WHERE command=? AND id<>?").get(v.command, v.id)) throw new ContractError("VERSION_CONFLICT", 409);
      const now = Math.max(Date.now(), (old?.updated_at || 0) + 1);
      this.db.prepare("INSERT INTO prompts(id,command,name,content,updated_at,user_modified) VALUES(?,?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET command=excluded.command,name=excluded.name,content=excluded.content,updated_at=excluded.updated_at,user_modified=1")
        .run(v.id, v.command, v.name, v.content, now);
      return validate("prompt", { id: v.id, command: v.command, name: v.name, content: v.content, updatedAt: now });
    });
  }
}
module.exports = { Prompts };
