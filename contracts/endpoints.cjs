const manifest = require("./http-v1.json");
const routes = manifest.routes.map(route => ({ ...route,
  expression: new RegExp("^" + manifest.prefix + route.path.replace(/:[A-Za-z]+/g, "[A-Za-z0-9_-]+") + "$") }));
function endpoint(method, pathname) { return routes.find(route => route.method === method && route.expression.test(pathname)) || null; }
module.exports = { endpoint };
