import * as crypto from "node:crypto";

/** SHA-256 hex do conteúdo UTF-8 */
export function hashContent(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}
