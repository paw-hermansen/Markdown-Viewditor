/**
 * Base64 ↔ bytes conversion and `data:` URI construction. Shared by the
 * export pipeline (image embedding, rasterized math) and the Mermaid label
 * passes (PNG captures).
 */

/**
 * Bytes to standard base64. Chunked: `String.fromCharCode(...bytes)` would
 * blow the argument limit on a large image.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Standard base64 to bytes. */
export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Wrap bytes as a `data:` URI of the given MIME type. */
export function bytesToDataUri(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${bytesToBase64(bytes)}`;
}
