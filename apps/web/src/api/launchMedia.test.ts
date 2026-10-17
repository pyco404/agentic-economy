import { describe, expect, it } from "vitest";
import { abortable, IpfsReference, LOGO_LIMITS, metadataKey, readLogoReference, sniffLogo, unavailableLaunchMedia, validateLogo } from "./launchMedia";
const png = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0];
const cid = "bafybeihgxdzljxb26q6nf3r3eifqeedsvt2eubqtskghpme66cgjyw4fra";
const reference = { cid, ipfsUri: `ipfs://${cid}`, gatewayUrl: `https://ipfs.io/ipfs/${cid}`, status: "verified", uploadId: "test-upload" };
const dimensions = async () => ({ width: 512, height: 512 });
describe("launch media validation and safe unavailable integration", () => {
  it("recognizes supported content signatures, never extensions or arbitrary MIME alone", () => {
    expect(sniffLogo(new Uint8Array(png))).toBe("image/png");
    expect(sniffLogo(new Uint8Array([255, 216, 255, 0]))).toBe("image/jpeg");
    expect(sniffLogo(new TextEncoder().encode("RIFF1234WEBP"))).toBe("image/webp");
    expect(sniffLogo(new TextEncoder().encode("<svg></svg>"))).toBeNull();
  });
  it("accepts a matching decodable image and rejects spoofed and unsupported types", async () => {
    await expect(validateLogo(new File([new Uint8Array(png)], "logo.png", { type: "image/png" }), undefined, dimensions)).resolves.toBe("image/png");
    await expect(validateLogo(new File([new Uint8Array(png)], "logo.jpg", { type: "image/jpeg" }), undefined, dimensions)).rejects.toThrow("does not match");
    await expect(validateLogo(new File(["malicious text"], "logo.png", { type: "image/png" }), undefined, dimensions)).rejects.toThrow("genuine");
  });
  it("rejects empty and oversized files before decoding, with a configurable limit", async () => {
    await expect(validateLogo(new File([], "empty.png"))).rejects.toThrow("non-empty");
    await expect(validateLogo(new File([new Uint8Array(50)], "too-large.png"), 40, dimensions)).rejects.toThrow("smaller");
    expect(LOGO_LIMITS.maxBytes).toBe(5_000_000);
  });
  it("rejects corrupt images and decompression-sized images", async () => {
    const file = new File([new Uint8Array(png)], "broken.png", { type: "image/png" });
    await expect(validateLogo(file, undefined, async () => { throw new Error("decode failure"); })).rejects.toThrow("corrupted");
    await expect(validateLogo(file, undefined, async () => ({ width: 10000, height: 10000 }))).rejects.toThrow("dimensions");
  });
  it("retains only consistent public references and rejects tampered stored values", () => {
    expect(readLogoReference(JSON.stringify(reference))).toEqual(reference);
    expect(readLogoReference(JSON.stringify({ ...reference, ipfsUri: "ipfs://wrong" }))).toBeNull();
    expect(readLogoReference(JSON.stringify({ ...reference, status: "pending" }))).toBeNull();
    expect(IpfsReference.safeParse({ ...reference, gatewayUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(readLogoReference("not JSON")).toBeNull();
  });
  it("invalidates metadata for each relevant changed input", () => {
    const input = { name: "Example", symbol: "EX", description: "Text", quoteAsset: "SOL", imageUploadId: "upload-a" };
    expect(metadataKey({ ...input })).toBe(metadataKey(input));
    for (const field of Object.keys(input)) expect(metadataKey({ ...input, [field]: "different" })).not.toBe(metadataKey(input));
  });
  it("settles cancellation even when a provider ignores the signal", async () => {
    const controller = new AbortController();
    const work = abortable(new Promise(() => {}), controller.signal); controller.abort();
    await expect(work).rejects.toHaveProperty("name", "AbortError");
    await expect(abortable(Promise.resolve(3), new AbortController().signal)).resolves.toBe(3);
  });
  it("never fabricates uploads or metadata while contracts are missing", async () => {
    expect(unavailableLaunchMedia.available).toBe(false);
    await expect(unavailableLaunchMedia.uploadLogo(new File([], "x"), { requestId: "test", signal: new AbortController().signal, onProgress: () => {} })).rejects.toThrow("unavailable");
    await expect(unavailableLaunchMedia.prepareMetadata({ name: "x", symbol: "X", description: "", quoteAsset: "SOL", imageUploadId: "" }, { requestId: "test", signal: new AbortController().signal })).rejects.toThrow("unavailable");
  });
});
