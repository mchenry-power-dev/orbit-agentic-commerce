/** Local-only, owned raster uploads. Canvas re-encodes pixels and drops active/metadata content. */
export async function readOwnedPhoto(file: File): Promise<string> {
  if (!["image/png", "image/jpeg"].includes(file.type))
    throw new Error(
      "Upload an owned PNG or JPEG. Active SVG/HTML and unsupported formats are rejected.",
    );
  if (!file.size || file.size > 5_000_000)
    throw new Error("Choose a PNG/JPEG under 5 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let width = 0,
    height = 0;
  if (
    file.type === "image/png" &&
    bytes.length >= 24 &&
    bytes[0] === 137 &&
    bytes[1] === 80 &&
    bytes[2] === 78 &&
    bytes[3] === 71
  ) {
    const view = new DataView(bytes.buffer);
    width = view.getUint32(16);
    height = view.getUint32(20);
  } else if (
    file.type === "image/jpeg" &&
    bytes[0] === 255 &&
    bytes[1] === 216
  ) {
    for (let offset = 2; offset + 9 < bytes.length;) {
      if (bytes[offset] !== 255) throw new Error("Invalid JPEG structure.");
      const marker = bytes[offset + 1];
      offset += 2;
      if (marker === 217 || marker === 218) break;
      if (marker === 0 || marker === 1 || (marker >= 208 && marker <= 215))
        continue;
      const length = bytes[offset] * 256 + bytes[offset + 1];
      if (length < 2 || offset + length > bytes.length)
        throw new Error("Truncated JPEG.");
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker)
      ) {
        height = bytes[offset + 3] * 256 + bytes[offset + 4];
        width = bytes[offset + 5] * 256 + bytes[offset + 6];
        break;
      }
      offset += length;
    }
  }
  if (
    !width ||
    !height ||
    width * height > 20_000_000 ||
    Math.max(width, height) > 8000
  )
    throw new Error(
      "Invalid or oversized raster dimensions; use an image no larger than 20 megapixels.",
    );
  const bitmap = await createImageBitmap(
    new Blob([bytes], { type: file.type }),
  );
  try {
    if (bitmap.width !== width || bitmap.height !== height)
      throw new Error("Encoded dimensions did not match the decoded photo.");
    const scale = Math.min(1, 1600 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot decode local photos.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    bitmap.close();
  }
}
