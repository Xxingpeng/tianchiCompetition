export const MAX_BODY_BYTES = 12 * 1024;

export type BodyReadResult =
  { ok: true; text: string } | { ok: false; reason: "too_large" | "unreadable" };

export async function readRequestBody(request: Request): Promise<BodyReadResult> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { ok: false, reason: "too_large" };
  }
  if (!request.body) return { ok: true, text: "" };

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too_large" };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { ok: true, text };
  } catch {
    await reader.cancel().catch(() => undefined);
    return { ok: false, reason: "unreadable" };
  } finally {
    reader.releaseLock();
  }
}

export function requestClientIp(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 128);
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const last = forwarded?.at(-1)?.trim();
  return last ? last.slice(0, 128) : "unknown";
}
