import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const publicUrl =
  process.env.HARHUB_PUBLIC_URL ??
  process.env.HARHUB_APP_URL ??
  "http://127.0.0.1:5176";
const developmentEnv = { ...process.env, NODE_ENV: "development" };
const children = [
  spawn(npmCommand, ["run", "dev:api"], {
    env: { ...developmentEnv, HARHUB_PUBLIC_URL: publicUrl },
    stdio: "inherit"
  }),
  spawn(npmCommand, ["run", "dev:web"], {
    env: developmentEnv,
    stdio: "inherit"
  })
];
let stopping = false;

for (const child of children) {
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code, signal) => {
    if (!stopping) stop(code ?? (signal ? 1 : 0));
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => stop(signal === "SIGINT" ? 130 : 143));
}

function stop(exitCode) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  process.exitCode = exitCode;
}
