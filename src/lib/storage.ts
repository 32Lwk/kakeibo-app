import path from "node:path";
import fs from "node:fs/promises";

const DATA_DIR = path.join(process.cwd(), ".data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

export async function ensureUploadDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  return UPLOAD_DIR;
}

export async function saveUpload({
  folder,
  fileName,
  bytes,
}: {
  folder: string; // e.g. receiptId
  fileName: string;
  bytes: Uint8Array;
}) {
  await ensureUploadDir();
  const safeName = fileName.replaceAll(/[\\/:*?"<>|]/g, "_").slice(0, 120);
  const dir = path.join(UPLOAD_DIR, folder);
  await fs.mkdir(dir, { recursive: true });
  const fullPath = path.join(dir, safeName);
  await fs.writeFile(fullPath, bytes);
  // store a relative key (portable)
  const key = path.relative(DATA_DIR, fullPath).replaceAll("\\", "/");
  return { fullPath, key };
}

export async function readStoredObject(key: string) {
  // key is relative to .data
  const fullPath = path.join(DATA_DIR, key);
  const bytes = await fs.readFile(fullPath);
  return { fullPath, bytes };
}

export async function deleteStoredObject(key: string) {
  const fullPath = path.join(DATA_DIR, key);
  await fs.unlink(fullPath).catch(() => null);
}

