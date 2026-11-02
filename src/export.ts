const MAX_BYTES = 10 * 1024 * 1024;

export async function readExportFile(response: Response) {
  if (Number(response.headers.get("content-length")) > MAX_BYTES) {
    await response.body?.cancel();
    throw new Error("Export exceeds 10 MiB limit");
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (response.body) {
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_BYTES) throw new Error("Export exceeds 10 MiB limit");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
  }
  const bytes = Buffer.concat(chunks);
  const mimeType = response.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream";
  const text = mimeType.startsWith("text/") || mimeType === "application/csv";
  return { mimeType, encoding: text ? "utf8" : "base64", size: bytes.length,
    content: bytes.toString(text ? "utf8" : "base64") };
}

export async function downloadExport(value: string, fetchImpl: typeof fetch) {
  const url = new URL(value);
  // Only known Jurnal export buckets; never send API credentials to file hosts.
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !/^jurnal-quickbook-s3(?:-dev)?\.s3[.-][a-z0-9-]+\.amazonaws\.com$/.test(url.hostname)) {
    throw new Error("Untrusted export URL host");
  }
  const response = await fetchImpl(url, {
    method: "GET", redirect: "error", signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Export download failed: HTTP ${response.status}`);
  }
  return readExportFile(response);
}
