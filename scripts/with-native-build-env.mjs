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

function withTrailingSeparator(value) {
  return value.endsWith(path.sep) ? value : `${value}${path.sep}`;
}

function findMsvcupEnvironment() {
  const candidates = [
    process.env.MSVCUP_TOOLCHAIN_ROOT,
    process.env.LOCALAPPDATA &&
      path.join(process.env.LOCALAPPDATA, "msvcup", "toolchain"),
  ]
    .map(existingDirectory)
    .filter(Boolean);

  for (const root of candidates) {
    const msvcDirectory = newestDirectory(
      path.join(root, "VC", "Tools", "MSVC"),
      [
        "include",
        path.join("lib", "x64"),
        path.join("bin", "Hostx64", "x64"),
      ],
    );
    const sdkRoot = path.join(root, "Windows Kits", "10");
    const sdkIncludeDirectory = newestDirectory(
      path.join(sdkRoot, "Include"),
      ["ucrt", "shared", "um"],
    );
    if (!msvcDirectory || !sdkIncludeDirectory) {
      continue;
    }

    const sdkVersion = path.basename(sdkIncludeDirectory);
    const sdkLibDirectory = path.join(sdkRoot, "Lib", sdkVersion);
    const sdkBinDirectory = path.join(sdkRoot, "bin", sdkVersion, "x64");
    if (
      !existsSync(path.join(sdkLibDirectory, "ucrt", "x64")) ||
      !existsSync(path.join(sdkLibDirectory, "um", "x64")) ||
      !existsSync(sdkBinDirectory)
    ) {
      continue;
    }

    return {
      root,
      msvcDirectory,
      sdkRoot,
      sdkVersion,
      sdkIncludeDirectory,
      sdkLibDirectory,
      sdkBinDirectory,
    };
  }

  return undefined;
}

function findExecutable(name, extraDirectories = []) {
  const pathDirectories = (process.env.Path ?? process.env.PATH ?? "")
    .split(path.delimiter)
    .filter(Boolean);
  return [...extraDirectories, ...pathDirectories]
    .map(existingDirectory)
    .filter(Boolean)
    .map((directory) => path.join(directory, name))
    .find(existsSync);
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

function findMsvcIncludeDirectory(msvcupEnvironment) {
  if (msvcupEnvironment) {
    return path.join(msvcupEnvironment.msvcDirectory, "include");
  }

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

function findWindowsSdkIncludeDirectories(msvcupEnvironment) {
  if (msvcupEnvironment) {
    return ["ucrt", "shared", "um", "winrt", "cppwinrt"]
      .map((name) => path.join(msvcupEnvironment.sdkIncludeDirectory, name))
      .filter(existsSync);
  }

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
  const msvcupEnvironment = findMsvcupEnvironment();
  const msvcIncludeDirectory = findMsvcIncludeDirectory(msvcupEnvironment);
  const sdkIncludeDirectories =
    findWindowsSdkIncludeDirectories(msvcupEnvironment);
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

  const environment = {
    ...process.env,
    LIBCLANG_PATH: libclangDirectory,
    BINDGEN_EXTRA_CLANG_ARGS: existingArguments
      ? `${existingArguments} ${bindgenArguments}`
      : bindgenArguments,
  };

  if (msvcupEnvironment) {
    const ninja = findExecutable("ninja.exe", [
      path.join(
        process.env.ProgramData ?? "C:\\ProgramData",
        "chocolatey",
        "bin",
      ),
    ]);
    if (!ninja) {
      throw new Error(
        [
          "A standalone msvcup toolchain was found, but Ninja is missing.",
          "Install it with `choco install ninja -y`, then retry.",
        ].join("\n"),
      );
    }

    const msvcBinDirectory = path.join(
      msvcupEnvironment.msvcDirectory,
      "bin",
      "Hostx64",
      "x64",
    );
    const msvcLibDirectory = path.join(
      msvcupEnvironment.msvcDirectory,
      "lib",
      "x64",
    );
    const existingPath = process.env.Path ?? process.env.PATH ?? "";
    const existingInclude = process.env.INCLUDE?.trim();
    const existingLib = process.env.LIB?.trim();

    environment.Path = [
      msvcBinDirectory,
      msvcupEnvironment.sdkBinDirectory,
      path.dirname(ninja),
      existingPath,
    ]
      .filter(Boolean)
      .join(path.delimiter);
    environment.INCLUDE = [
      msvcIncludeDirectory,
      ...sdkIncludeDirectories,
      existingInclude,
    ]
      .filter(Boolean)
      .join(path.delimiter);
    environment.LIB = [
      msvcLibDirectory,
      path.join(msvcupEnvironment.sdkLibDirectory, "ucrt", "x64"),
      path.join(msvcupEnvironment.sdkLibDirectory, "um", "x64"),
      existingLib,
    ]
      .filter(Boolean)
      .join(path.delimiter);
    environment.VCINSTALLDIR = withTrailingSeparator(
      path.join(msvcupEnvironment.root, "VC"),
    );
    environment.VCToolsInstallDir = withTrailingSeparator(
      msvcupEnvironment.msvcDirectory,
    );
    environment.VisualStudioVersion = "17.0";
    environment.WindowsSdkDir = withTrailingSeparator(
      msvcupEnvironment.sdkRoot,
    );
    environment.WindowsSDKVersion = `${msvcupEnvironment.sdkVersion}${path.sep}`;
    environment.CMAKE_GENERATOR = process.env.CMAKE_GENERATOR || "Ninja";

    console.log(
      `[native-env] standalone MSVC: ${msvcupEnvironment.msvcDirectory}`,
    );
    console.log(`[native-env] CMake generator: ${environment.CMAKE_GENERATOR}`);
  }

  return environment;
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
