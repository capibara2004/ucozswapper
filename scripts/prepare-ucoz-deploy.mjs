import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const deployRoot = path.join(projectRoot, "deploy", "ucozswapper");

const serverPackage = JSON.parse(
  await readFile(path.join(projectRoot, "server", "package.json"), "utf8")
);

const deployPackage = {
  name: "ucozswapper-production",
  private: true,
  version: serverPackage.version,
  type: "module",
  engines: {
    node: ">=22.0.0"
  },
  scripts: {
    start: "node app.js"
  },
  dependencies: serverPackage.dependencies
};

await rm(deployRoot, { recursive: true, force: true });
await mkdir(deployRoot, { recursive: true });

await Promise.all([
  cp(path.join(projectRoot, "server", "src"), path.join(deployRoot, "server", "src"), {
    recursive: true
  }),
  cp(path.join(projectRoot, "client", "dist"), path.join(deployRoot, "client", "dist"), {
    recursive: true
  }),
  cp(path.join(projectRoot, "server", "package-lock.json"), path.join(deployRoot, "package-lock.json"))
]);

await writeFile(
  path.join(deployRoot, "package.json"),
  `${JSON.stringify(deployPackage, null, 2)}\n`,
  "utf8"
);

await writeFile(
  path.join(deployRoot, "app.js"),
  'import "./server/src/index.js";\n',
  "utf8"
);

await writeFile(
  path.join(deployRoot, "DEPLOY.txt"),
  [
    "UcozSwapper production bundle for uCoz Server Scripts.",
    "Upload the CONTENTS of this directory into the configured app_node application root.",
    "Startup file: app.js",
    "Install dependencies from package.json, then restart the Node.js application.",
    "Do not upload server/.env; configure secrets in the uCoz environment variables UI."
  ].join("\n") + "\n",
  "utf8"
);

console.log(`uCoz deployment bundle prepared: ${path.relative(projectRoot, deployRoot)}`);
