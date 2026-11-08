const { MouseInput } = require("../../desktop/mouse-input.cjs");
const observer = new MouseInput(
  (event) => {
    if (event.type === "ready")
      process.send?.({ ready: true, pid: observer.child.pid });
  },
  () => process.exit(2),
);
observer.start("x2");
