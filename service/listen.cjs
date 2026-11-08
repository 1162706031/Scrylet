const crypto = require("node:crypto");
async function listenAutomatic(
  server,
  {
    host = "127.0.0.1",
    selectPort = () => crypto.randomInt(20000, 65000),
    attempts = 20,
    platform = process.platform,
  } = {},
) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await new Promise((resolve, reject) => {
        const failed = (error) => {
          server.removeListener("listening", ready);
          reject(error);
        };
        const ready = () => {
          server.removeListener("error", failed);
          resolve();
        };
        server
          .once("error", failed)
          .once("listening", ready)
          .listen(selectPort(), host);
      });
      return;
    } catch (error) {
      // Windows excluded port ranges may report EACCES rather than EADDRINUSE.
      // These are automatic binds only; explicit user ports still fail visibly.
      if (
        error.code !== "EADDRINUSE" &&
        !(platform === "win32" && error.code === "EACCES")
      )
        throw error;
      if (attempt === attempts - 1) throw error;
    }
  }
  throw Error("AUTOMATIC_PORT_UNAVAILABLE");
}
module.exports = { listenAutomatic };
