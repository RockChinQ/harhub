import { spawn, spawnSync } from "node:child_process";

const s3Env = {
  HARHUB_S3_BUCKET: "harhub-assets",
  HARHUB_S3_REGION: "us-east-1",
  HARHUB_S3_ENDPOINT: "http://127.0.0.1:9000",
  HARHUB_S3_FORCE_PATH_STYLE: "true",
  HARHUB_S3_PREFIX: "dev",
  HARHUB_S3_PUBLIC_BASE_URL: "http://127.0.0.1:9000/harhub-assets",
  AWS_ACCESS_KEY_ID: "minioadmin",
  AWS_SECRET_ACCESS_KEY: "minioadmin"
};

run("docker", ["compose", "up", "-d", "minio", "createbuckets"]);

const devCommand =
  process.platform === "win32"
    ? { command: "cmd.exe", args: ["/d", "/s", "/c", "npm run dev"] }
    : { command: "npm", args: ["run", "dev"] };

const dev = spawn(devCommand.command, devCommand.args, {
  env: { ...process.env, ...s3Env },
  stdio: "inherit"
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    dev.kill(signal);
  });
}

dev.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
