import { execFile } from "child_process";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { promisify } from "util";
import { env } from "./env";
import type { SlipExtraction } from "./types";

const execFileAsync = promisify(execFile);

export async function processSlipImage(imageBuffer: Buffer): Promise<SlipExtraction> {
  const dir = await mkdtemp(path.join(tmpdir(), "helfer-slip-"));
  const imagePath = path.join(dir, "slip-image");

  try {
    await writeFile(imagePath, imageBuffer);
    const [command, ...args] = splitCommand(env.SLIP_WORKER_COMMAND);
    const { stdout } = await execFileAsync(command, [...args, imagePath], {
      timeout: 30000,
      maxBuffer: 1024 * 1024
    });

    return JSON.parse(stdout) as SlipExtraction;
  } catch (error) {
    return {
      isSlip: false,
      type: "unknown",
      rawText: "",
      confidence: 0,
      reasons: [error instanceof Error ? error.message : "Slip processor failed"]
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function splitCommand(command: string) {
  return command.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((part) => part.replace(/^"|"$/g, "")) ?? [command];
}
