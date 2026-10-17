/**
 * 客户端智能图片压制管线 (Web 端对齐 macOS / Android 压制契约)
 * - 最大边限制至 2560px
 * - 质量 85% JPEG 压缩
 * - 过滤非位图 (GIF, SVG 直接透传)
 */
export async function compressClientImage(
  file: File,
  maxEdge: number = 2560,
  quality: number = 0.85
): Promise<File> {
  // 非图片或动画 GIF / SVG 直接透传
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') {
    return file
  }

  // 小于 300KB 的小图无需再压
  if (file.size <= 300 * 1024) {
    return file
  }

  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img

      // 尺寸判定
      if (width <= maxEdge && height <= maxEdge && file.size < 1024 * 1024) {
        // 尺寸与体积已在理想范围
        resolve(file)
        return
      }

      const currentMax = Math.max(width, height)
      if (currentMax > maxEdge) {
        const scale = maxEdge / currentMax
        width = Math.round(width * scale)
        height = Math.round(height * scale)
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')

      if (!ctx) {
        resolve(file)
        return
      }

      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) {
            // 如果压缩后反而变大，则使用原文件
            resolve(file)
            return
          }

          const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name
          const compressedFile = new File([blob], `${baseName}.jpg`, {
            type: 'image/jpeg',
            lastModified: file.lastModified,
          })
          resolve(compressedFile)
        },
        'image/jpeg',
        quality
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file)
    }

    img.src = url
  })
}
