const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const args = process.argv.slice(2);

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    stdio: "inherit",
    shell: false,
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 1);
}

function ensureWindowsJunction(shortRoot) {
  if (fs.existsSync(shortRoot)) {
    const actualTarget = fs.realpathSync.native(shortRoot);
    const expectedTarget = fs.realpathSync.native(projectRoot);

    if (actualTarget.toLowerCase() !== expectedTarget.toLowerCase()) {
      throw new Error(`${shortRoot} already points to ${actualTarget}`);
    }

    return;
  }

  fs.symlinkSync(projectRoot, shortRoot, "junction");
}

if (process.platform !== "win32") {
  run("npx", ["expo", "run:android", ...args], { cwd: projectRoot });
}

const shortRoot = process.env.WHAGONS_ANDROID_SHORT_ROOT || "C:\\w5";
ensureWindowsJunction(shortRoot);

const expoCli = path.join(shortRoot, "node_modules", "expo", "bin", "cli");

run(process.execPath, [expoCli, "run:android", ...args], {
  cwd: shortRoot,
  env: {
    ...process.env,
    INIT_CWD: shortRoot,
    PWD: shortRoot,
    npm_config_local_prefix: shortRoot,
  },
});
