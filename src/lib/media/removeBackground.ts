// مسح خلفية Images محليًا داخل المتصفح (بدون رفعها لأي خادم).
export async function removeImageBackground(file: File | Blob): Promise<Blob> {
  const { removeBackground } = await import("@imgly/background-removal");
  return await removeBackground(file, { output: { format: "image/png" } });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
