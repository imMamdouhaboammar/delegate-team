export const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m"
};

import { spawnSync } from "node:child_process";

export function runCmd(command: string, args: string[] = []) {
  try {
    const res = spawnSync(command, args, { encoding: "utf8" });
    return { status: res.status, stdout: res.stdout || "", stderr: res.stderr || "" };
  } catch (err: any) {
    return { status: -1, stdout: "", stderr: err.message };
  }
}
