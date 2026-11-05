import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { access, cp, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  application,
  artifact,
  auditArtifact,
  entryPoint,
  isInside,
  repository,
} from "./called-together-artifact.mjs";

await access(path.join(artifact, entryPoint));
await auditArtifact(artifact);
const isolated = await mkdtemp(path.join(tmpdir(), "called-together-smoke-"));
assert(
  !isInside(repository, isolated),
  "Smoke test must run outside the checkout",
);
let child;
let exited;
let output = "";
const interruption = new AbortController();
const stop = () => interruption.abort();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

try {
  await cp(artifact, isolated, { recursive: true });
  const serverFile = path.join(isolated, entryPoint);
  const require = createRequire(serverFile);
  assert(
    isInside(isolated, require.resolve("next")),
    "Next must resolve inside the isolated artifact",
  );
  const sqlOperator = path.join(
    isolated,
    application,
    "build/sql/operators/verify-sql.js",
  );
  await access(sqlOperator);
  const sqlRequire = createRequire(sqlOperator);
  for (const name of ["mssql", "@azure/identity"]) {
    assert(
      isInside(isolated, sqlRequire.resolve(name)),
      `${name} must resolve inside the isolated SQL artifact`,
    );
  }
  assert(
    isInside(
      isolated,
      createRequire(sqlRequire.resolve("mssql")).resolve("tedious"),
    ),
  );
  // With no SQL settings, loading the real compiled command must fail safely,
  // before contacting Azure or SQL. This is a packaging check, not a DB probe.
  for (const options of [[], ["--public-articles"]]) {
    const sqlCheck = spawnSync(
      process.execPath,
      ["--conditions=react-server", sqlOperator, ...options],
      {
        cwd: isolated,
        env: {
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
          WINDIR: process.env.WINDIR,
          NODE_ENV: "production",
        },
        windowsHide: true,
        encoding: "utf8",
        timeout: 20000,
      },
    );
    assert.equal(sqlCheck.error, undefined);
    assert.equal(
      sqlCheck.status,
      1,
      "Unconfigured SQL operator must exit nonzero without connecting",
    );
    assert.equal(sqlCheck.stdout, "");
    assert.equal(
      sqlCheck.stderr.trim(),
      "SQL verification failed: set valid SQL_SERVER and SQL_DATABASE settings.",
    );
  }

  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve, reject) =>
    reservation.close((error) => (error ? reject(error) : resolve())),
  );

  // No NODE_PATH, NODE_OPTIONS, repository environment, or repository cwd.
  // System variables below are needed to launch Node on Windows.
  child = spawn(process.execPath, [serverFile], {
    cwd: isolated,
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      TEMP: isolated,
      TMP: isolated,
      NODE_ENV: "production",
      HOSTNAME: "0.0.0.0",
      PORT: String(port),
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  exited = once(child, "exit");
  child.stdout.on("data", (data) => {
    output = (output + data).slice(-12000);
  });
  child.stderr.on("data", (data) => {
    output = (output + data).slice(-12000);
  });
  const base = `http://127.0.0.1:${port}`;
  async function request(url) {
    return fetch(new URL(url, base), {
      signal: AbortSignal.any([interruption.signal, AbortSignal.timeout(5000)]),
      redirect: "error",
    });
  }

  const deadline = Date.now() + 45000;
  let ready = false;
  while (Date.now() < deadline) {
    interruption.signal.throwIfAborted();
    assert(
      child.exitCode === null && child.signalCode === null,
      "Production server exited before readiness",
    );
    try {
      const response = await request("/api/health");
      if (response.ok) {
        ready = true;
        break;
      }
    } catch (error) {
      interruption.signal.throwIfAborted();
      if (Date.now() >= deadline) throw error;
    }
    await delay(250, undefined, { signal: interruption.signal });
  }
  assert(ready, "Production server did not become ready");

  for (let attempt = 0; attempt < 2; attempt++) {
    const health = await request("/api/health");
    assert.equal(health.status, 200);
    assert.match(health.headers.get("content-type"), /application\/json/);
    assert.match(health.headers.get("cache-control"), /no-store/);
    assert.deepEqual(await health.json(), { status: "ok" });
  }
  // No SQL settings are supplied to this isolated process. Missing configuration
  // fails before credential construction or network access, including in the APIs.
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const route of ["/api/articles", "/api/articles/fictional-missing"]) {
      const response = await request(route);
      assert.equal(response.status, 503);
      assert.match(response.headers.get("cache-control"), /no-store/);
      assert.deepEqual(await response.json(), {
        error: "Published articles are temporarily unavailable.",
      });
    }
  }
  for (const route of ["/api/articles?page=0", "/api/articles/INVALID"]) {
    const response = await request(route);
    assert.equal(response.status, 400);
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.deepEqual(await response.json(), {
      error: "Invalid article request.",
    });
  }
  assert.equal(
    (await request("/api/health")).status,
    200,
    "SQL failures must not affect health",
  );
  const prerender = JSON.parse(
    await readFile(
      path.join(isolated, application, ".next/prerender-manifest.json"),
      "utf8",
    ),
  );
  assert(
    !Object.hasOwn(prerender.routes, "/api/health"),
    "Health endpoint must not be prerendered",
  );

  assert.equal(prerender.routes["/api/articles"], undefined);
  assert.equal(prerender.routes["/api/articles/[slug]"], undefined);
  assert.equal(prerender.dynamicRoutes?.["/api/articles/[slug]"], undefined);
  const home = await request("/");
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-type"), /text\/html/);
  const html = await home.text();
  assert(
    html.includes(
      "<title>Called Together | Women in Spiritual Leadership</title>",
    ),
  );
  const assets = [
    ...html.matchAll(/(?:src|href)="([^"\s]+\.(?:js|css)(?:\?[^"\s]*)?)"/g),
  ].map((match) => match[1].replaceAll("&amp;", "&"));
  assert(
    assets.some((asset) => new URL(asset, base).pathname.endsWith(".js")),
    "Homepage must reference JavaScript",
  );
  assert(
    assets.some((asset) => new URL(asset, base).pathname.endsWith(".css")),
    "Homepage must reference CSS",
  );
  for (const asset of new Set(assets)) {
    const url = new URL(asset, base);
    assert.equal(url.origin, base);
    assert(url.pathname.startsWith("/_next/static/"));
    const response = await request(asset);
    assert.equal(response.status, 200, `Asset failed: ${url.pathname}`);
    assert.match(
      response.headers.get("content-type"),
      url.pathname.endsWith(".css") ? /text\/css/ : /javascript/,
    );
    const file = path.join(
      isolated,
      application,
      ".next",
      url.pathname.slice("/_next/".length),
    );
    assert.deepEqual(
      Buffer.from(await response.arrayBuffer()),
      await readFile(file),
    );
  }

  async function verifyPublic(directory, prefix = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      const route = `${prefix}/${encodeURIComponent(entry.name)}`;
      if (entry.isDirectory()) await verifyPublic(file, route);
      else {
        const response = await request(route);
        assert.equal(response.status, 200, `Public asset failed: ${route}`);
        assert.deepEqual(
          Buffer.from(await response.arrayBuffer()),
          await readFile(file),
        );
      }
    }
  }
  const publicDirectory = path.join(isolated, application, "public");
  await access(publicDirectory).then(
    () => verifyPublic(publicDirectory),
    (error) => {
      if (error.code !== "ENOENT") throw error;
    },
  );
  console.log(
    `Isolated production smoke test passed: homepage, ${new Set(assets).size} JS/CSS assets, public assets when present, request-time health endpoint, uncached article API validation/unavailability, and both private SQL operator modes/dependencies (no database access).`,
  );
} catch (error) {
  console.error(output);
  throw error;
} finally {
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
    try {
      await exited;
    } finally {
      clearTimeout(timer);
    }
  }
  // isolated was allocated by mkdtemp under the OS temporary directory.
  assert(isInside(tmpdir(), isolated) && isolated !== tmpdir());
  await rm(isolated, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
}
