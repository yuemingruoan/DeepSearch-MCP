#!/usr/bin/env node

// 启动 DeepSearch MCP 服务器的 Node.js 包装脚本。

const { spawn } = require("child_process");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const userArgs = process.argv.slice(2);
const uvArgs = [
  "run",
  "--project",
  projectRoot,
  "python",
  "main.py",
  ...userArgs,
];

const child = spawn("uv", uvArgs, {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});

child.on("error", (error) => {
  console.error("无法启动 uv，请确认已安装 uv 并在 PATH 中可用。");
  console.error(error);
  process.exit(1);
});
