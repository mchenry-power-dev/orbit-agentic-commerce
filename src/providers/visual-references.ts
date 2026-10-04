import type { ImageGenerationRequest, RasterImage } from "../domain/service";
import type { StudioBrand } from "../domain/studio";
import { inspectRaster } from "./composition";
import { readOwnedPhoto } from "./uploads";

export function imageReferenceInputs(
  rasters: RasterImage[],
): ImageGenerationRequest["referenceImages"] {
  return rasters.map(({ mimeType, base64 }) => ({ mimeType, base64 }));
}

/** Selected references are locally decoded before explicit live-service transmission. */
export async function readVisualReferences(
  brand: StudioBrand,
  signal?: AbortSignal,
): Promise<RasterImage[]> {
  const sources = brand.sources.filter(
    (s) => s.included && s.role === "visual-inspiration" && s.image,
  );
  if (sources.length > 2)
    throw new Error(
      "Select at most two visual image references for live generation.",
    );
  return Promise.all(
    sources.map(async (source) => {
      const raw = source.image!;
      const url = raw.startsWith("data:")
        ? raw
        : new URL(
            raw.replace(/^\//, ""),
            new URL(import.meta.env.BASE_URL, location.origin),
          ).href;
      if (!raw.startsWith("data:") && new URL(url).origin !== location.origin)
        throw new Error(
          "Import or upload the reference through the protected raster path before generation.",
        );
      const response = await fetch(url, {
        signal,
        credentials: "omit",
        redirect: "error",
      });
      if (!response.ok)
        throw new Error("The selected visual reference could not be read.");
      const photo = await readOwnedPhoto(
        new File([await response.blob()], "selected-reference", {
          type: response.headers.get("content-type")?.split(";")[0] ?? "",
        }),
      );
      const raster = inspectRaster(photo, 4 * 1024 * 1024);
      return {
        mimeType: raster.mime,
        width: raster.width,
        height: raster.height,
        byteLength: raster.bytes,
        base64: photo.slice(photo.indexOf(",") + 1),
      };
    }),
  );
}
