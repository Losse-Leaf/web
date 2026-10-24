/**
 * 客户端智能图片压制管线 (Web 端对齐 macOS / Android 压制契约)
 * - 最大边限制至 2048px（与 Android 端 ImagePipeline.MAX_EDGE 一致）
 * - 质量 82% JPEG 压缩（与 Android 端 JPEG_QUALITY 一致）
 * - 过滤非位图 (GIF, SVG 直接透传)
 *
 * MOB-P0-16 修复要点：
 * 1. EXIF 方向：统一用 createImageBitmap(file, { imageOrientation: 'from-image' })，
 *    否则 Safari 竖拍照片会被旋转 90° 上传。
 * 2. Safari 黑图：旧实现�� drawImage 之前就 revokeObjectURL，Safari 可能重解析
 *    blob URL 得到空白画布；现在保证 URL 在解码完成后再释放。
 * 3. 内存：createImageBitmap 可选 resizeWidth 直接按目标尺寸解码，
 *    避免 12MP 原图（≈48MB）在堆里完整展开。
 */

export const MAX_EDGE = 2048
export const JPEG_QUALITY = 0.82
/** 小于该体积且尺寸达标的小图直接透传，避免无意义的二次编码 */
const PASSTHROUGH_SIZE = 200 * 1024

interface DecodedImage {
  width: number
  height: number
  draw: (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) => void
  release: () => void
}

/** 优先使用 createImageBitmap（可指定方向与缩放，内存友好），回退到 <img> 解码 */
async function decodeImage(file: File, targetMaxEdge: number): Promise<DecodedImage | null> {
  // 1) 现代路径：createImageBitmap + imageOrientation + 直接按目标尺寸解码
  if (typeof createImageBitmap === 'function') {
    try {
      // 探测尺寸也必须带 imageOrientation: 'from-image' ——
      // 不带时 probe 是「未旋转」的存储尺寸，而后续 resize 是在**已旋转**的位图上执行，
      // 竖拍（EXIF orientation 6/8 等且最长边 > 2048）会被按横幅比例缩放，内容压扁变形。
      // 不支持该选项的老浏览器会在此抛错，自动落到 <img> 回退路径（其 natural* 已含方向）。
      const probe = await createImageBitmap(file, { imageOrientation: 'from-image' })
      const sourceMax = Math.max(probe.width, probe.height)
      if (sourceMax <= targetMaxEdge) {
        // 尺寸已达标：probe 本身已按 EXIF 方向旋转，直接复用，无需二次解码
        return {
          width: probe.width,
          height: probe.height,
          draw: (ctx) => ctx.drawImage(probe, 0, 0, probe.width, probe.height),
          release: () => probe.close(),
        }
      }
      const scale = targetMaxEdge / sourceMax
      const resized = await createImageBitmap(file, {
        imageOrientation: 'from-image',
        resizeWidth: Math.round(probe.width * scale),
        resizeHeight: Math.round(probe.height * scale),
        resizeQuality: 'high',
      }).catch(() => null)

      if (resized) {
        probe.close()
        return {
          width: resized.width,
          height: resized.height,
          draw: (ctx) => ctx.drawImage(resized, 0, 0, resized.width, resized.height),
          release: () => resized.close(),
        }
      }
      probe.close()
    } catch {
      // 落到下面的 <img> 回退路径
    }
  }

  // 2) 回退路径：<img> + objectURL（注意必须在解码完成后再释放 URL）
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const sourceMax = Math.max(img.naturalWidth, img.naturalHeight)
      const scale = sourceMax > targetMaxEdge ? targetMaxEdge / sourceMax : 1
      const width = Math.max(1, Math.round(img.naturalWidth * scale))
      const height = Math.max(1, Math.round(img.naturalHeight * scale))
      resolve({
        width,
        height,
        draw: (ctx) => ctx.drawImage(img, 0, 0, width, height),
        release: () => URL.revokeObjectURL(url),
      })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

function canvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  quality: number
): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: 'image/jpeg', quality })
  }
  return new Promise((resolve) => {
    ;(canvas as HTMLCanvasElement).toBlob(
      (blob) => resolve(blob),
      'image/jpeg',
      quality
    )
  })
}

/**
 * 压缩单张图片（失败时原样透传，绝不丢图）
 * @param file 原始文件
 * @param maxEdge 最大边（默认 2048，与 Android 端一致）
 * @param quality JPEG 质量（默认 0.82，与 Android 端一致）
 */
export async function compressClientImage(
  file: File,
  maxEdge: number = MAX_EDGE,
  quality: number = JPEG_QUALITY
): Promise<File> {
  // 非图片或动画 GIF / SVG 直接透传
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') {
    return file
  }

  // 极小文件无需再压
  if (file.size <= PASSTHROUGH_SIZE) {
    return file
  }

  const decoded = await decodeImage(file, maxEdge)
  if (!decoded) return file

  try {
    // 尺寸与体积均已理想：直接透传原图（避免二次编码劣化）
    if (decoded.width <= maxEdge && decoded.height <= maxEdge && file.size < 1024 * 1024) {
      return file
    }

    let canvas: HTMLCanvasElement | OffscreenCanvas
    let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
    try {
      if (typeof OffscreenCanvas !== 'undefined') {
        const offscreen = new OffscreenCanvas(decoded.width, decoded.height)
        canvas = offscreen
        ctx = offscreen.getContext('2d')
      } else {
        const element = document.createElement('canvas')
        element.width = decoded.width
        element.height = decoded.height
        canvas = element
        ctx = element.getContext('2d')
      }
    } catch {
      return file
    }

    if (!ctx) return file

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    decoded.draw(ctx)

    const blob = await canvasToBlob(canvas, quality)
    if (!blob || blob.size >= file.size) {
      // 压缩后反而更大：使用原文件
      return file
    }

    const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name
    return new File([blob], `${baseName}.jpg`, {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    })
  } catch {
    return file
  } finally {
    decoded.release()
  }
}
