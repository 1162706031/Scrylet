module.exports = require("./scripts/package-config.cjs").packageConfig({
  platform: process.platform,
  arch: process.arch,
  profile: "development",
});
