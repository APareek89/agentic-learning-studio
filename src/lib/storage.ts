/** Private upload objects are namespaced by the verified actor; public media has its own CDN prefix. */
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { requireUserId } from "./db";

let client: S3Client | undefined;
export async function persistPrivateUpload(id: string, document: unknown): Promise<string | null> {
  const owner = requireUserId();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new Error("Invalid upload identifier");
  const bucket = process.env.STORAGE_BUCKET;
  if (!bucket) {
    if (process.env.NODE_ENV === "production") throw new Error("Upload storage is unavailable");
    return null;
  }
  client ??= new S3Client({ region: process.env.AWS_REGION || "ap-south-1" });
  const key = `private/uploads/${owner}/${id}.json`;
  const body = JSON.stringify(document);
  await client.send(new PutObjectCommand({
    Bucket: bucket, Key: key, Body: body, ContentType: "application/json",
    ServerSideEncryption: "AES256", CacheControl: "private,no-store",
    Metadata: { sha256: createHash("sha256").update(body).digest("hex") },
  }));
  return key;
}

export function publicThumbnailUrl(name: string): string {
  if (!/^[a-z0-9_-]+\.webp$/.test(name)) return "";
  const base = process.env.MEDIA_PUBLIC_BASE_URL?.replace(/\/$/, "");
  return base ? `${base}/lesson-thumbs/${name}` : "";
}

const PUBLIC_THUMBNAILS = new Set(["agents.webp", "build.webp", "evaluation.webp", "foundations.webp", "frameworks.webp", "generative.webp", "infrastructure.webp", "llms.webp", "rag.webp", "safety.webp"]);
/** Public proxy is deliberately limited to these ten rescued curated images. */
export async function getPublicThumbnail(name: string): Promise<{ body: Uint8Array; contentType: "image/webp" } | null> {
  if (!PUBLIC_THUMBNAILS.has(name)) return null;
  const bucket = process.env.STORAGE_BUCKET;
  if (!bucket) return null;
  client ??= new S3Client({ region: process.env.AWS_REGION || "ap-south-1" });
  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: `public/lesson-thumbs/${name}` }));
  if (!object.Body) return null;
  const body = await object.Body.transformToByteArray();
  // All rescued files were measured below 20 KB; reject wrong or unexpected payloads.
  if (body.byteLength > 100_000 || body.byteLength < 12 || Buffer.from(body.subarray(0, 4)).toString() !== "RIFF" || Buffer.from(body.subarray(8, 12)).toString() !== "WEBP") throw new Error("Invalid public thumbnail");
  return { body, contentType: "image/webp" };
}
