import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "/snap/phone/",
  build: {
    outDir: "../build/phone",
    emptyOutDir: true,
    target: ["chrome110", "safari16.4"],
    license: { fileName: "licenses.md" },
    commonjsOptions: { include: [/node_modules/, /contracts/] },
    rollupOptions: { input: { app: fileURLToPath(new URL("index.html", import.meta.url)), compatibility: fileURLToPath(new URL("compatibility.html", import.meta.url)) } },
  },
});
