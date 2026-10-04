import sharp from "sharp";
import type { RasterImage } from "../src/domain/service";
import { ServiceError } from "./errors";
export const MAX_RASTER_BYTES = 4 * 1024 * 1024;
export function decodeBase64(
  value: string,
  maxBytes = MAX_RASTER_BYTES,
): Buffer {
  if (
    !value ||
    value.length > Math.ceil(maxBytes / 3) * 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value) ||
    value.length % 4 !== 0
  )
    throw new ServiceError(
      "invalid-raster",
      "Supply a bounded base64 PNG, JPEG or WebP image.",
    );
  const bytes = Buffer.from(value, "base64");
  if (bytes.length > maxBytes || bytes.toString("base64") !== value)
    throw new ServiceError(
      "invalid-raster",
      "Invalid or oversized raster encoding.",
    );
  return bytes;
}
export async function normalizeRaster(
  bytes: Uint8Array,
  claimedMime: string,
): Promise<RasterImage> {
  if (bytes.byteLength > MAX_RASTER_BYTES)
    throw new ServiceError("image-too-large", "Image exceeds 4 MiB.", 413);
  const input = Buffer.from(bytes);
  const magic = input.subarray(0, 16);
  const detected = magic
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? "image/png"
    : magic[0] === 255 && magic[1] === 216 && magic[2] === 255
      ? "image/jpeg"
      : magic.toString("ascii", 0, 4) === "RIFF" &&
          magic.toString("ascii", 8, 12) === "WEBP"
        ? "image/webp"
        : undefined;
  if (!detected || claimedMime.split(";")[0].trim().toLowerCase() !== detected)
    throw new ServiceError(
      "image-type",
      "Image MIME/signature mismatch or unsupported active content. Use PNG, JPEG or WebP.",
    );
  try {
    const image = sharp(input, {
      limitInputPixels: 16_000_000,
      failOn: "warning",
      animated: false,
    });
    const metadata = await image.metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width < 16 ||
      metadata.height < 16 ||
      metadata.width > 8192 ||
      metadata.height > 8192 ||
      (metadata.pages ?? 1) > 1
    )
      throw new ServiceError(
        "image-dimensions",
        "Reference dimensions must be 16–8192 pixels and single-frame.",
      );
    const mimeType =
      detected === "image/jpeg"
        ? ("image/jpeg" as const)
        : ("image/png" as const);
    const { data, info } = await (
      mimeType === "image/jpeg"
        ? image.rotate().jpeg({ quality: 90 })
        : image.rotate().png()
    ).toBuffer({ resolveWithObject: true });
    if (data.byteLength > MAX_RASTER_BYTES)
      throw new ServiceError(
        "image-too-large",
        "Decoded image exceeds the output size limit.",
        413,
      );
    return {
      mimeType,
      width: info.width,
      height: info.height,
      byteLength: data.length,
      base64: data.toString("base64"),
    };
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError(
      "invalid-raster",
      "The image could not be safely decoded. Use a smaller valid raster image.",
    );
  }
}
