#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), "..");
const userArgs = process.argv.slice(2);

const distEntry = path.join(projectRoot, "dist", "main.js");
const tsEntry = path.join(projectRoot, "main.ts");

const command = existsSync(distEntry)
  ? { cmd: "node", args: [distEntry, ...userArgs] }
  : { cmd: process.platform === "win32" ? "npx.cmd" : "npx", args: ["tsx", tsEntry, ...userArgs] };

const child = spawn(command.cmd, command.args, {
  stdio: "inherit",
  env: process.env,
  shell: false,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});

child.on("error", (error) => {
  console.error("无法启动 DeepSearch MCP 服务器，请确认已安装 tsx 或已执行 npm run build。");
  console.error(error);
  process.exit(1);
});
