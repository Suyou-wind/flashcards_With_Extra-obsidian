import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

/** Native transport and check logs; scenario assertions stay in the runner. */
export function createObsidianDriver(options: {
  repository: string;
  vault: string;
  vaultPath: string;
  output: string;
}) {
  const { repository, vault, vaultPath, output } = options;
  async function cli(...args: string[]): Promise<string> {
    const { stdout, stderr } = await exec(
      process.env.OBSIDIAN_CLI ?? "obsidian",
      [`vault=${vault}`, ...args],
      { cwd: repository, timeout: 45000, maxBuffer: 8 * 1024 * 1024 },
    );
    if (/^Error:/m.test(stdout)) throw new Error(stdout.trim());
    if (stderr.trim())
      await writeFile(path.join(output, "cli-stderr.txt"), stderr, {
        flag: "a",
      });
    return stdout.trim();
  }

  async function browser<T = unknown>(body: string): Promise<T> {
    const code = `(async()=>{try{if(app.vault.adapter.basePath!==${JSON.stringify(vaultPath)})throw new Error("Wrong test vault");const n=window.__flashcardsScopeNative;return JSON.stringify({ok:true,value:await(async()=>{${body}})()});}catch(error){return JSON.stringify({ok:false,error:String(error?.stack||error)});}})()`;
    const result = await cli("eval", `code=${code}`);
    const start = result.indexOf("=> ");
    if (start < 0)
      throw new Error(
        `Unexpected Obsidian CLI output: ${result.slice(0, 300)}`,
      );
    const parsed = JSON.parse(result.slice(start + 3)) as {
      ok: boolean;
      value: T;
      error?: string;
    };
    if (!parsed.ok) throw new Error(parsed.error ?? "Native evaluation failed");
    return parsed.value;
  }

  async function runNpm(script: "lint" | "build"): Promise<void> {
    try {
      const result = await exec("npm", ["run", script], {
        cwd: repository,
        timeout: 120000,
        maxBuffer: 8 * 1024 * 1024,
      });
      await writeFile(
        path.join(output, `${script}.txt`),
        result.stdout + result.stderr,
      );
    } catch (error) {
      const result = error as { stdout?: string; stderr?: string };
      await writeFile(
        path.join(output, `${script}.txt`),
        (result.stdout ?? "") + (result.stderr ?? "") + String(error),
      );
      throw error;
    }
  }
  return { cli, browser, runNpm };
}
