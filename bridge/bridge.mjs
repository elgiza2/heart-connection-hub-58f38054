/** @doc Megsy Desktop Bridge — Windows-only local executor. */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, hostname, platform } from "node:os";
import { join, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const API = process.env.MEGSY_BRIDGE_URL || "https://ltgampdtawuefwwayncx.supabase.co/functions/v1/device-bridge";
const ROOT = join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "MegsyBridge");
const CONFIG = join(ROOT, "config.json");
const VERSION = "1.0.0";
const POLL_MS = 1800;
const MAX_OUTPUT = 120000;

if (platform() !== "win32") {
  console.error("Megsy Desktop Bridge currently supports Windows only.");
  process.exit(1);
}
mkdirSync(ROOT, { recursive: true });

function load() {
  if (!existsSync(CONFIG)) return {};
  try { return JSON.parse(readFileSync(CONFIG, "utf8")); } catch { return {}; }
}
function save(value) { writeFileSync(CONFIG, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 }); }
async function api(body) {
  const response = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status}: ${data.error || "request_failed"}`);
  return data;
}
function withinWorkDir(value, workDir) {
  const base = resolve(workDir || homedir());
  const target = resolve(base, String(value || ""));
  return target === base || target.startsWith(base + sep) ? target : null;
}
function textResult(stdout, stderr) {
  return { stdout: String(stdout || "").slice(0, MAX_OUTPUT), stderr: String(stderr || "").slice(0, MAX_OUTPUT) };
}
async function execute(command, workDir) {
  const payload = command.payload || {};
  const cwd = workDir || homedir();
  switch (command.kind) {
    case "shell":
    case "powershell": {
      const script = String(payload.command || "");
      if (!script.trim()) throw new Error("empty_command");
      const result = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "RemoteSigned", "-Command", script], { cwd, windowsHide: true, maxBuffer: MAX_OUTPUT * 2 });
      return textResult(result.stdout, result.stderr);
    }
    case "sysinfo":
      return { hostname: hostname(), platform: process.platform, arch: process.arch, version: process.version, cwd };
    case "list_dir": {
      const path = withinWorkDir(payload.path || ".", cwd);
      if (!path) throw new Error("path_outside_work_dir");
      const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", `Get-ChildItem -LiteralPath ${JSON.stringify(path)} | Select-Object Name,Length,LastWriteTime,Mode | ConvertTo-Json -Compress`], { windowsHide: true, maxBuffer: MAX_OUTPUT });
      return { entries: JSON.parse(stdout || "[]") };
    }
    case "read_file": {
      const path = withinWorkDir(payload.path, cwd);
      if (!path) throw new Error("path_outside_work_dir");
      const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", `Get-Content -LiteralPath ${JSON.stringify(path)} -Raw`], { windowsHide: true, maxBuffer: MAX_OUTPUT });
      return { content: String(stdout).slice(0, MAX_OUTPUT), path };
    }
    case "write_file": {
      const path = withinWorkDir(payload.path, cwd);
      if (!path) throw new Error("path_outside_work_dir");
      const content = String(payload.content || "");
      if (content.length > MAX_OUTPUT) throw new Error("file_too_large");
      const encoded = Buffer.from(content, "utf8").toString("base64");
      await execFileAsync("powershell.exe", ["-NoProfile", "-Command", `[IO.File]::WriteAllText(${JSON.stringify(path)}, [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')))`], { windowsHide: true });
      return { ok: true, path };
    }
    case "delete_file": {
      const path = withinWorkDir(payload.path, cwd);
      if (!path) throw new Error("path_outside_work_dir");
      await execFileAsync("powershell.exe", ["-NoProfile", "-Command", `Remove-Item -LiteralPath ${JSON.stringify(path)} -Force`], { windowsHide: true });
      return { ok: true, path };
    }
    case "screenshot": {
      const path = withinWorkDir(payload.path || `megsy-screenshot-${Date.now()}.png`, cwd);
      if (!path) throw new Error("path_outside_work_dir");
      const script = `$bmp = New-Object Drawing.Bitmap ([Windows.Forms.Screen]::PrimaryScreen.Bounds.Width), ([Windows.Forms.Screen]::PrimaryScreen.Bounds.Height); $g = [Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen(0,0,0,0,$bmp.Size); $bmp.Save(${JSON.stringify(path)}); $g.Dispose(); $bmp.Dispose()`;
      await execFileAsync("powershell.exe", ["-NoProfile", "-Command", "Add-Type -AssemblyName System.Drawing; Add-Type -AssemblyName System.Windows.Forms; " + script], { windowsHide: true });
      return { ok: true, path };
    }
    default:
      throw new Error(`unsupported_command:${command.kind}`);
  }
}
async function report(config, command, result, error) {
  await api({ device_id: config.device_id, token: config.token, action: "report", command_id: command.id, result: error ? null : result, error: error ? String(error.message || error) : null });
}
async function loop(config) {
  console.log(`Megsy Bridge connected as ${config.device_id}. Press Ctrl+C to stop.`);
  while (true) {
    try {
      const response = await api({ device_id: config.device_id, token: config.token, action: "poll" });
      for (const command of response.commands || []) {
        try { await report(config, command, await execute(command, response.work_dir), null); }
        catch (error) { await report(config, command, null, error); }
      }
    } catch (error) {
      console.error(`Bridge connection: ${error.message}`);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 5000));
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, POLL_MS));
  }
}
const args = process.argv.slice(2);
const pairIndex = args.indexOf("--pair");
const existing = load();
if (pairIndex >= 0) {
  const code = args[pairIndex + 1];
  if (!code) { console.error("Usage: node bridge.mjs --pair CODE"); process.exit(1); }
  try {
    const paired = await api({ action: "pair", code, hostname: hostname(), os: "windows", agent_version: VERSION });
    save({ device_id: paired.device_id, token: paired.token, paired_at: new Date().toISOString(), version: VERSION });
    console.log(`Paired successfully as ${paired.name}. Config saved to ${CONFIG}`);
    await loop(load());
  } catch (error) { console.error(`Pairing failed: ${error.message}`); process.exit(1); }
} else if (existing.device_id && existing.token) {
  await loop(existing);
} else {
  console.error("Not paired. Run: node bridge.mjs --pair YOUR_CODE");
  process.exit(1);
}
