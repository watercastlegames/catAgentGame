import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const children = [
  spawn(npmCommand, ["run", "bridge"], {
    stdio: "inherit",
    windowsHide: true,
    shell: process.platform === "win32",
  }),
  spawn(npmCommand, ["run", "dev"], {
    stdio: "inherit",
    windowsHide: true,
    shell: process.platform === "win32",
  }),
];

let closing = false;
function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  setTimeout(() => process.exit(code), 250);
}

for (const child of children) {
  child.on("exit", (code) => {
    if (!closing && code && code !== 0) shutdown(code);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
