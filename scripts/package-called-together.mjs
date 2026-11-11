import { access, mkdir, rm } from "node:fs/promises";
import { nodeFileTrace } from "@vercel/nft";
import path from "node:path";
import {
  application,
  artifact,
  auditArtifact,
  copyRuntime,
  entryPoint,
  isInside,
  repository,
} from "./called-together-artifact.mjs";

const source = path.join(repository, application);
const standalone = path.join(source, ".next/standalone");
await access(path.join(standalone, entryPoint));
await access(path.join(source, ".next/static"));
const sqlEntry = path.join(source, "build/sql/operators/verify-sql.js");
await access(sqlEntry);
// This private command is not reachable from a Next route, so trace it explicitly.
const operatorEntries = [
  "verify-sql",
  "migrate",
  "bootstrap-admin",
  "verify-auth-sql",
  "notification-delivery",
  "recover-pending",
  "prepare-auth-verification",
].map((name) => path.join(source, "build/sql/operators/" + name + ".js"));
const sqlTrace = await nodeFileTrace(operatorEntries, {
  base: repository,
  processCwd: source,
  // NFT selects import/require per module; forcing both can trace the wrong
  // branch of Azure SDK packages with conditional exports.
  conditions: ["node", "react-server"],
});

// This is the only generated destination this script is allowed to replace.
if (!isInside(repository, artifact) || artifact === repository) {
  throw new Error("Artifact destination must be inside the repository");
}
await rm(artifact, {
  recursive: true,
  force: true,
  maxRetries: 5,
  retryDelay: 200,
});
await mkdir(artifact, { recursive: true });
await copyRuntime(standalone, artifact);
for (const relative of sqlTrace.fileList) {
  const file = path.resolve(repository, relative);
  if (!isInside(repository, file))
    throw new Error("SQL trace escaped the repository");
  await copyRuntime(file, path.join(artifact, relative));
}
const runtimeApp = path.join(artifact, application);
await copyRuntime(
  path.join(source, ".next/static"),
  path.join(runtimeApp, ".next/static"),
);
// public is optional; failures while copying an existing directory must surface.
const publicExists = await access(path.join(source, "public")).then(
  () => true,
  (error) => {
    if (error.code === "ENOENT") return false;
    throw error;
  },
);
if (publicExists)
  await copyRuntime(
    path.join(source, "public"),
    path.join(runtimeApp, "public"),
  );
await copyRuntime(
  path.join(source, "database/migrations"),
  path.join(runtimeApp, "database/migrations"),
);
await auditArtifact(artifact);
await access(path.join(artifact, entryPoint));
await access(path.join(runtimeApp, "build/sql/operators/verify-sql.js"));
console.log("Packaged artifacts/called-together");
console.log(`Startup from artifact root: HOSTNAME=0.0.0.0 node ${entryPoint}`);
