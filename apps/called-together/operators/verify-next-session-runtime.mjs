import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import process from "node:process";

// Isolated running Next app: real production repository/bindings and installed
// drivers, but an in-memory transport. No SQL Connection, credentials or socket.
const require = createRequire(import.meta.url);
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const legacy = process.argv.includes("--unexternalized");
const directory = path.join(
  app,
  "build",
  "next-session-runtime",
  legacy ? "before" : "after",
);
const config = (await import("../next.config.js")).default;
const reservation = createServer();
await new Promise((resolve, reject) => {
  reservation.once("error", reject);
  reservation.listen(0, "127.0.0.1", resolve);
});
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const files = {
  "package.json": JSON.stringify({ private: true, type: "module" }),
  "next.config.mjs": `export default ${JSON.stringify({
    ...config,
    ...(legacy ? { serverExternalPackages: [] } : {}),
    distDir: ".next",
    turbopack: { root: path.resolve(app, "../..") },
  })};`,
  "app/layout.tsx":
    "export default function Layout({children}) { return <html><body>{children}</body></html>; }",
  "transport.ts": `import { EventEmitter } from 'node:events';
import sql from 'mssql';
import { Connection, TYPES } from 'tedious';
const id = '00000000-0000-4000-8000-000000000001';
export function install() {
 if (globalThis.calledTogetherDatabase) return;
 const connection = Object.assign(new EventEmitter(), {
  databaseCollation: undefined, config: {options:{}}, debug:{log(){}},
  currentTransactionDescriptor:()=>Buffer.alloc(8),
  resolveRequestParameter:Connection.prototype.resolveRequestParameter,
  execSql:Connection.prototype.execSql,
  makeRequest(request) {
   const text=request.sqlTextOrProcedure;
   const row=text.includes('TOP (100)') ? null : text.includes('u.actorId')
    ? {id,userId:id,actorId:id,email:'fixture@example.invalid',name:'Fixture',expiresAt:new Date(Date.now()+60000).toISOString()}
    : text.includes('SELECT r.Role') ? {Role:'Administrator'} : {id};
   const metadata=Object.keys(row ?? {id}).map(colName=>({colName,type:TYPES.NVarChar,flags:1}));
   request.emit('columnMetadata',metadata);
   if(row) request.emit('row',metadata.map(m=>({metadata:m,value:row[m.colName]})));
   request.emit('doneInProc',row?1:0,false); request.callback(null);
  }
 });
 const pool={connected:true,config:{},request(){return new sql.Request(this)},
   acquire(_request,callback){callback(null,connection,{})},release(){}};
 globalThis.calledTogetherDatabase={getPool:async()=>pool};
}
export async function check() {
 install();
 const pool=await globalThis.calledTogetherDatabase.getPool();
 const requestClassMatches=pool.request() instanceof sql.Request;
 const {accounts}=await import('../../../server/admin/repository.ts');
 try {
  const session=await accounts.session(id);
  const list=await accounts.list();
  return {ok:session?.roles.includes('Administrator')===true && list.length===0,requestClassMatches};
 } catch(error) {
  // Inspect privately; emit only fixed classifications, never raw error text.
  let unmapped=false, eparam=false;
  const pending=[error],seen=new Set();
  for(let i=0;pending.length && i<12;i++) {
   const e=pending.shift(); if(!e || typeof e!=='object' || seen.has(e))continue; seen.add(e);
   if(e.code==='EPARAM')eparam=true;
   if(e.message==='type.validate is not a function')unmapped=true;
   pending.push(e.cause,e.originalError);
  }
  return {ok:false,classification:eparam && unmapped?'sql_type_identity_unmapped':'unclassified',requestClassMatches};
 }
}`,
  "app/api/session/route.ts":
    "import {check} from '../../../transport'; export const dynamic='force-dynamic'; export async function GET(){return Response.json(await check());}",
  "app/admin/page.tsx":
    "import {check} from '../../transport'; export const dynamic='force-dynamic'; export default async function Page(){const result=await check();return <main>{JSON.stringify(result)}</main>;}",
};
for (const [name, source] of Object.entries(files)) {
  const target = path.join(directory, name);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, source);
}
const child = spawn(
  process.execPath,
  [
    require.resolve("next/dist/bin/next"),
    "dev",
    directory,
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    cwd: directory,
    windowsHide: true,
    env: {
      ...process.env,
      SQL_SERVER: "",
      SQL_DATABASE: "",
      AUTH_DEBUG: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
// Startup/compiler output is intentionally not forwarded. It may contain paths
// or free-form exceptions. Only assertions and fixed classifications are emitted.
child.stdout.resume();
child.stderr.resume();
try {
  const base = "http://127.0.0.1:" + port;
  let api;
  for (let i = 0; i < 120; i++) {
    try {
      api = await fetch(base + "/api/session");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (!api?.ok) throw new Error("Next fixture API unavailable");
  const apiResult = await api.json();
  const page = await fetch(base + "/admin");
  const html = await page.text();
  const main = html.match(/<main>(.*?)<\/main>/s)?.[1];
  const pageResult = main ? JSON.parse(main.replaceAll("&quot;", '"')) : {};
  const passed =
    apiResult.ok === true &&
    apiResult.requestClassMatches === true &&
    page.ok &&
    pageResult.ok === !legacy &&
    pageResult.requestClassMatches === !legacy &&
    (!legacy || pageResult.classification === "sql_type_identity_unmapped");
  console.log(
    JSON.stringify({
      runtime: "Next.js",
      mode: legacy ? "unexternalized" : "configured",
      apiPassed: apiResult.ok === true,
      pagePassed: !legacy && passed,
      reproducedUnmappedType: legacy && passed,
    }),
  );
  if (!passed) throw new Error("Next fixture assertion failed");
} finally {
  child.kill();
  child.stdout.destroy();
  child.stderr.destroy();
  child.unref();
}
