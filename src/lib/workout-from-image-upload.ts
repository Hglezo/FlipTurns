export async function sniffLikelyHeic(blob: Blob): Promise<boolean> {
  if (blob.size < 12) return false;
  const b = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  if (String.fromCharCode(b[4], b[5], b[6], b[7]) !== "ftyp") return false;
  const brand = String.fromCharCode(b[8], b[9], b[10], b[11]).toLowerCase();
  return /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(brand);
}

export async function isJpegOrPngBlob(blob: Blob): Promise<boolean> {
  if (blob.size < 8) return false;
  const b = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true;
  return false;
}

export async function blobToWorkoutUploadDataUrl(blob: Blob, maxSide = 2048, quality = 0.85): Promise<string> {
  const drawToJpeg = (img: CanvasImageSource, w: number, h: number) => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  };
  const scale = (w: number, h: number) => {
    if (w <= maxSide && h <= maxSide) return { w, h };
    if (w > h) return { w: maxSide, h: Math.round((h * maxSide) / w) };
    return { w: Math.round((w * maxSide) / h), h: maxSide };
  };
  try {
    const bmp = await createImageBitmap(blob);
    try {
      const { w, h } = scale(bmp.width, bmp.height);
      return drawToJpeg(bmp, w, h);
    } finally {
      bmp.close();
    }
  } catch {
    try {
      const url = URL.createObjectURL(blob);
      try {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject();
          img.src = url;
        });
        const { w, h } = scale(img.naturalWidth, img.naturalHeight);
        return drawToJpeg(img, w, h);
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch {
      return new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("Failed to read image"));
        r.readAsDataURL(blob);
      });
    }
  }
}
