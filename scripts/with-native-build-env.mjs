import { existsSync, readdirSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");

function existingDirectory(candidate) {
  return candidate && existsSync(candidate) ? path.resolve(candidate) : undefined;
}

function childDirectories(parent) {
  try {
    return readdirSync(parent, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(parent, entry.name));
  } catch {
    return [];
  }
}

function newestDirectory(parent, requiredChildren = []) {
  return childDirectories(parent)
    .filter((candidate) =>
      requiredChildren.every((child) => existsSync(path.join(candidate, child))),
    )
    .sort((left, right) =>
      path.basename(right).localeCompare(path.basename(left), undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    )[0];
}

function findLibclangDirectory() {
  const configured = process.env.LIBCLANG_PATH;
  const configuredDirectory =
    configured && path.extname(configured).toLowerCase() === ".dll"
      ? path.dirname(configured)
      : configured;
  const pathCandidates = (process.env.Path ?? "")
    .split(path.delimiter)
    .filter(Boolean);
  const candidates = [
    configuredDirectory,
    ...pathCandidates,
    path.join(process.env.ProgramFiles ?? "C:\\Program Files", "LLVM", "bin"),
    path.join(
      process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
      "LLVM",
      "bin",
    ),
  ];

  return candidates
    .map(existingDirectory)
    .filter(Boolean)
    .find((candidate) => existsSync(path.join(candidate, "libclang.dll")));
}

function findClangResourceDirectory(libclangDirectory) {
  const clang = path.join(libclangDirectory, "clang.exe");
  if (existsSync(clang)) {
    try {
      const detected = execFileSync(clang, ["-print-resource-dir"], {
        encoding: "utf8",
        windowsHide: true,
      }).trim();
      if (existsSync(path.join(detected, "include"))) {
        return detected;
      }
    } catch {
      // Fall through to the conventional LLVM layout.
    }
  }

  const clangRoot = path.resolve(libclangDirectory, "..", "lib", "clang");
  return newestDirectory(clangRoot, ["include"]);
}

function findMsvcIncludeDirectory() {
  const configured = existingDirectory(process.env.VCToolsInstallDir);
  if (configured && existsSync(path.join(configured, "include"))) {
    return path.join(configured, "include");
  }

  const programFilesX86 =
    process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  const vswhere = path.join(
    programFilesX86,
    "Microsoft Visual Studio",
    "Installer",
    "vswhere.exe",
  );

  let installationPath;
  if (existsSync(vswhere)) {
    try {
      installationPath = execFileSync(
        vswhere,
        [
          "-latest",
          "-products",
          "*",
          "-requires",
          "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
          "-property",
          "installationPath",
        ],
        { encoding: "utf8", windowsHide: true },
      ).trim();
    } catch {
      // The fallback directory scan below handles older VS installations.
    }
  }

  if (installationPath) {
    const toolsRoot = path.join(installationPath, "VC", "Tools", "MSVC");
    const detected = newestDirectory(toolsRoot, ["include"]);
    if (detected) {
      return path.join(detected, "include");
    }
  }

  const visualStudioRoot = path.join(
    programFilesX86,
    "Microsoft Visual Studio",
  );
  for (const yearDirectory of childDirectories(visualStudioRoot).sort().reverse()) {
    for (const editionDirectory of childDirectories(yearDirectory)) {
      const detected = newestDirectory(
        path.join(editionDirectory, "VC", "Tools", "MSVC"),
        ["include"],
      );
      if (detected) {
        return path.join(detected, "include");
      }
    }
  }

  return undefined;
}

function findWindowsSdkIncludeDirectories() {
  const programFilesX86 =
    process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  const sdkRoots = [
    process.env.WindowsSdkDir &&
      path.join(process.env.WindowsSdkDir, "Include"),
    path.join(programFilesX86, "Windows Kits", "10", "Include"),
  ].filter(Boolean);
  const configuredVersion = process.env.WindowsSDKVersion?.replace(/[\\/]+$/, "");

  for (const sdkRoot of sdkRoots) {
    const configured =
      configuredVersion && path.join(sdkRoot, configuredVersion);
    const versionDirectory =
      (configured &&
        ["ucrt", "shared", "um"].every((name) =>
          existsSync(path.join(configured, name)),
        ) &&
        configured) ||
      newestDirectory(sdkRoot, ["ucrt", "shared", "um"]);
    if (versionDirectory) {
      return ["ucrt", "shared", "um"].map((name) =>
        path.join(versionDirectory, name),
      );
    }
  }

  return [];
}

function quoteBindgenPath(value) {
  return `"${value.replaceAll("\\", "/").replaceAll('"', '\\"')}"`;
}

function windowsNativeEnvironment() {
  const libclangDirectory = findLibclangDirectory();
  if (!libclangDirectory) {
    throw new Error(
      [
        "Voice compilation requires LLVM/libclang, but libclang.dll was not found.",
        "Install it with `choco install llvm -y` or the official LLVM Windows installer:",
        "https://github.com/llvm/llvm-project/releases",
      ].join("\n"),
    );
  }

  const resourceDirectory = findClangResourceDirectory(libclangDirectory);
  const msvcIncludeDirectory = findMsvcIncludeDirectory();
  const sdkIncludeDirectories = findWindowsSdkIncludeDirectories();
  if (!resourceDirectory || !msvcIncludeDirectory || sdkIncludeDirectories.length === 0) {
    throw new Error(
      [
        "LLVM was found, but the native C/C++ header set is incomplete.",
        "Install Visual Studio 2022 Build Tools with Desktop development with C++",
        "and a Windows 10 or Windows 11 SDK, then retry.",
      ].join("\n"),
    );
  }

  const bindgenArguments = [
    `-resource-dir=${quoteBindgenPath(resourceDirectory)}`,
    ...[msvcIncludeDirectory, ...sdkIncludeDirectories].flatMap((directory) => [
      "-isystem",
      quoteBindgenPath(directory),
    ]),
  ].join(" ");
  const existingArguments = process.env.BINDGEN_EXTRA_CLANG_ARGS?.trim();

  console.log(`[native-env] libclang: ${libclangDirectory}`);
  console.log(`[native-env] MSVC headers: ${msvcIncludeDirectory}`);
  console.log(
    `[native-env] Windows SDK: ${path.dirname(sdkIncludeDirectories[0])}`,
  );

  return {
    ...process.env,
    LIBCLANG_PATH: libclangDirectory,
    BINDGEN_EXTRA_CLANG_ARGS: existingArguments
      ? `${existingArguments} ${bindgenArguments}`
      : bindgenArguments,
  };
}

function resolveCommand(command, args) {
  if (command !== "tauri") {
    return { executable: command, args };
  }

  const tauriEntry = path.join(
    repositoryRoot,
    "node_modules",
    "@tauri-apps",
    "cli",
    "tauri.js",
  );
  if (!existsSync(tauriEntry)) {
    throw new Error("Tauri CLI is missing. Run `npm install` first.");
  }
  return { executable: process.execPath, args: [tauriEntry, ...args] };
}

const [command, ...commandArguments] = process.argv.slice(2);
if (!command) {
  console.error(
    "Usage: node scripts/with-native-build-env.mjs <command> [args...]",
  );
  process.exit(2);
}

try {
  const environment =
    process.platform === "win32"
      ? windowsNativeEnvironment()
      : { ...process.env };
  const resolved = resolveCommand(command, commandArguments);
  const child = spawn(resolved.executable, resolved.args, {
    cwd: repositoryRoot,
    env: environment,
    stdio: "inherit",
    windowsHide: false,
  });

  child.once("error", (error) => {
    console.error(`[native-env] Failed to start ${command}: ${error.message}`);
    process.exit(1);
  });
  child.once("exit", (code, signal) => {
    if (signal) {
      console.error(`[native-env] ${command} exited from signal ${signal}.`);
      process.exit(1);
    }
    process.exit(code ?? 1);
  });
} catch (error) {
  console.error(`[native-env] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
