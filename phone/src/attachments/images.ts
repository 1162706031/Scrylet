import { ApiError, response, schemas } from "../api";
import type { ImageRef } from "../chat/useComposer";

export async function uploadImage(
  blob: Blob,
  name = "截图.jpg",
): Promise<ImageRef> {
  if (!blob.size || blob.size > 20 * 1024 * 1024)
    throw new ApiError("TOO_LARGE", "图片大小需在 20 MiB 内");
  const result = await response(
    "/snap/api/files?name=" + encodeURIComponent(name),
    { method: "POST", headers: { "Content-Type": blob.type }, body: blob },
  );
  const file = schemas.file.parse(await result.json());
  return { fileId: file.id, name: file.name, mime: file.mime };
}
export async function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.93),
  );
  if (!blob) throw new ApiError("INVALID_CONTRACT", "图片处理失败，请重新选择");
  return blob;
}
export async function rasterImage(
  source: Blob | string,
): Promise<HTMLCanvasElement> {
  const url = typeof source === "string" ? source : URL.createObjectURL(source);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth * image.naturalHeight > 80_000_000
    )
      throw new Error("IMAGE_DIMENSIONS");
    const scale = Math.min(
        1,
        2560 / Math.max(image.naturalWidth, image.naturalHeight),
      ),
      canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("CANVAS_UNAVAILABLE");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    if (typeof source !== "string") URL.revokeObjectURL(url);
  }
}
export async function uploadSelection(file: File): Promise<ImageRef> {
  if (!file.type.startsWith("image/"))
    throw new ApiError("INVALID_CONTRACT", "请选择图片文件");
  if (/^image\/(png|jpeg|webp|gif)$/.test(file.type))
    return uploadImage(file, file.name);
  return uploadImage(
    await canvasBlob(await rasterImage(file)),
    file.name.replace(/\.[^.]+$/, "") + ".jpg",
  );
}
