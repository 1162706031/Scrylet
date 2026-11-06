// Only pointer timing/selection lives here; it never captures or sends by itself.
class RegionGesture {
  constructor({ holdMs, timeoutMs, onChange, onRegion, onDoubleClick, doubleMs = 0 }) {
    Object.assign(this, { holdMs, timeoutMs, onChange, onRegion, onDoubleClick, doubleMs });
    this.phase = "idle";
  }
  arm() {
    this.cancel();
    this.phase = "first";
    this.firstDeadline = Date.now() + this.timeoutMs;
    this.onChange({ phase: "first" });
    this.wait = setTimeout(() => this.cancel("选区已超时取消"), this.timeoutMs);
  }
  down(point) {
    if (this.pressed) return;
    clearTimeout(this.wait);
    this.pressed = { ...point, at: Date.now() };
    this.hold = setTimeout(() => this.recognize(), this.holdMs);
  }
  move(point) {
    if (!this.pressed) return;
    if (Math.hypot(point.x - this.pressed.x, point.y - this.pressed.y) > 8) {
      clearTimeout(this.hold);
      this.pressed.moved = true;
      this.lastClick = null;
      clearTimeout(this.wait);
      const deadline = this.phase === "second" ? this.secondDeadline : this.phase === "first" ? this.firstDeadline : null;
      if (deadline) this.wait = setTimeout(() => this.cancel("选区已超时取消"), Math.max(0, deadline - Date.now()));
    }
  }
  recognize() {
    if (!this.pressed || this.pressed.moved) return;
    this.pressed.held = true;
    this.lastClick = null;
    if (this.phase === "second") {
      this.second = { x: this.pressed.x, y: this.pressed.y };
      this.phase = "complete";
      this.onChange({ phase: "release", first: this.first, second: this.second });
    } else {
      this.first = { x: this.pressed.x, y: this.pressed.y };
      this.phase = "release-first";
      this.onChange({ phase: "release-first", first: this.first });
    }
  }
  up() {
    if (!this.pressed) return;
    clearTimeout(this.hold);
    const pressed = this.pressed;
    this.pressed = null;
    if (this.phase === "complete") {
      const first = this.first, second = this.second;
      this.cancel();
      this.onRegion(first, second);
    } else if (this.phase === "release-first" || this.phase === "second") {
      this.phase = "second";
      if (!this.secondDeadline) this.secondDeadline = Date.now() + this.timeoutMs;
      const deadline = this.secondDeadline;
      if (Date.now() >= deadline) { this.cancel("选区已超时取消"); return; }
      this.onChange({ phase: "second", first: this.first, deadline });
      this.wait = setTimeout(() => this.cancel("选区已超时取消"), deadline - Date.now());
    } else if (this.phase === "first") {
      const remaining = this.firstDeadline - Date.now();
      if (remaining <= 0) this.cancel("选区已超时取消");
      else this.wait = setTimeout(() => this.cancel("选区已超时取消"), remaining);
    } else if (!pressed.held && !pressed.moved && this.doubleMs > 0) {
      const now = Date.now();
      if (this.lastClick && now - this.lastClick.at <= this.doubleMs &&
          Math.hypot(pressed.x - this.lastClick.x, pressed.y - this.lastClick.y) <= 8) {
        this.lastClick = null;
        this.onDoubleClick?.();
      } else this.lastClick = { ...pressed, at: now };
    }
  }
  cancel(message = "") {
    clearTimeout(this.hold);
    clearTimeout(this.wait);
    this.pressed = this.first = this.second = this.lastClick = null;
    this.firstDeadline = this.secondDeadline = null;
    this.phase = "idle";
    this.onChange({ phase: "idle", message });
  }
}

module.exports = { RegionGesture };
