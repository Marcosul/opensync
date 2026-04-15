"use strict";

const esbuild = require("esbuild");
const fs = require("node:fs");
const path = require("node:path");

const appRoot = path.join(__dirname, "..");
const dist = path.join(appRoot, "dist");

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

esbuild.buildSync({
  absWorkingDir: appRoot,
  entryPoints: [path.join(appRoot, "src/cli.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  outfile: path.join(appRoot, "dist/cli.js"),
  external: ["better-sqlite3"],
  logLevel: "info",
});
