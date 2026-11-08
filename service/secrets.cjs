const crypto = require("node:crypto");
const { ContractError } = require("../contracts/validate.cjs");
class SecretChannel {
  constructor(send) { this.send = send; this.pending = new Map(); }
  request(value) {
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new ContractError("STORAGE_FAILED", 503)); }, 5000);
      this.pending.set(requestId, { resolve, reject, timer });
      this.send({ type: "secret-request", requestId, ...value });
    });
  }
  receive(message) {
    const pending = this.pending.get(message.requestId);
    if (!pending) throw new ContractError("PROTOCOL_MISMATCH");
    this.pending.delete(message.requestId); clearTimeout(pending.timer);
    if (message.ok) pending.resolve(message.value); else pending.reject(new ContractError("STORAGE_FAILED", 503));
  }
  close() { for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new ContractError("INTERRUPTED", 503)); } this.pending.clear(); }
}
module.exports = { SecretChannel };
