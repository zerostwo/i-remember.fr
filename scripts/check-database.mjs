import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
const root = resolve("."), temporary = mkdtempSync(join(tmpdir(), "songqi-test-"));
let running = false, bin;
const run = (command, args, options = {}) => execFileSync(command, args, { stdio: "inherit", ...options });
let url = process.env.I_REMEMBER_TEST_DATABASE_URL;
try {
  if (!url) {
    bin = execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim();
    const server = createServer();
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    await new Promise(resolve => server.close(resolve));
    run(join(bin, "initdb"), ["-D", join(temporary, "pg"), "-U", "review", "-A", "trust", "--no-locale", "--encoding=UTF8"]);
    run(join(bin, "pg_ctl"), ["-D", join(temporary, "pg"), "-l", join(temporary, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port} -k ${temporary}`, "-w", "start"]);
    running = true;
    run(join(bin, "createdb"), ["-h", "127.0.0.1", "-p", String(port), "-U", "review", "songqi_test"]);
    url = `postgresql://review@127.0.0.1:${port}/songqi_test`;
  }
  if (!/(?:test|review)/i.test(new URL(url).pathname)) throw new Error("Use a disposable test/review database");
  const env = { ...process.env, DATABASE_URL: url, I_REMEMBER_TEST_DATABASE_URL: url };
  run(process.execPath, [resolve("packages/database/node_modules/prisma/build/index.js"), "migrate", "deploy"], { cwd: resolve("packages/database"), env });
  for (const script of ["check-postgres-regressions", "check-admin-workspace", "check-media-library"]) run(process.execPath, [`scripts/${script}.mjs`], { cwd: root, env });
} finally {
  if (running) run(join(bin, "pg_ctl"), ["-D", join(temporary, "pg"), "-m", "fast", "-w", "stop"]);
  rmSync(temporary, { recursive: true, force: true });
}
