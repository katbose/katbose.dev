import { createHmac } from "node:crypto";

export function pseudonymizeIp(ip: string, key: string): string {
  return createHmac("sha256", key).update(ip).digest("hex");
}

export function getRequestPseudonym(request: Request): string | null {
  const ip = request.headers.get("cf-connecting-ip");
  const key = process.env["IP_PSEUDONYM_KEY"];
  const epoch = process.env["IP_PSEUDONYM_EPOCH"];
  if (!ip || !key || !epoch) return null;
  return `${epoch}:${pseudonymizeIp(ip, key)}`;
}
