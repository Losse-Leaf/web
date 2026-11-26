export interface PhotoExifMetadata {
  occurredAt?: string
  latitude?: number
  longitude?: number
}

const PURE_NUMBER_OR_HOUSE_REGEX = /^[\d\s\-—#号楼室单元层/.]+$/

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * 将 EXIF 日期字符串（YYYY:MM:DD HH:MM:SS）及可选时区偏移（如 +09:00 / Z）
 * 换算为北京墙上时间字符串 YYYY-MM-DDTHH:mm（供 PaperDatePicker 与后端 FlexTime 使用）。
 */
export function parseExifDateToBeijingInput(rawDate?: string | null, rawOffset?: string | null): string | undefined {
  const trimmed = (rawDate || '').trim()
  if (!trimmed || trimmed.startsWith('0000')) return undefined

  const m = /^(\d{4})[:\-](\d{2})[:\-](\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/.exec(trimmed)
  if (!m) return undefined

  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const hour = Number(m[4])
  const minute = Number(m[5])
  const second = Number(m[6] || '0')
  if (year < 1970 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return undefined
  }

  let offsetMinutes: number | null = null
  const cleanOffset = (rawOffset || '').trim()
  if (cleanOffset === 'Z' || cleanOffset === 'z') {
    offsetMinutes = 0
  } else if (/^[+-]\d{2}:?\d{2}$/.test(cleanOffset)) {
    const sign = cleanOffset[0] === '-' ? -1 : 1
    const digits = cleanOffset.slice(1).replace(':', '')
    const oh = Number(digits.slice(0, 2))
    const om = Number(digits.slice(2, 4))
    offsetMinutes = sign * (oh * 60 + om)
  }

  if (offsetMinutes !== null) {
    // 先算出 UTC epoch，再加上 +08:00 得到北京墙上时间
    const utcMs = Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60_000
    const beijing = new Date(utcMs + 8 * 60 * 60_000)
    return `${beijing.getUTCFullYear()}-${pad2(beijing.getUTCMonth() + 1)}-${pad2(beijing.getUTCDate())}T${pad2(beijing.getUTCHours())}:${pad2(beijing.getUTCMinutes())}`
  }

  return `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}`
}

export function isValidCoordinates(lat?: number, lon?: number): boolean {
  if (typeof lat !== 'number' || typeof lon !== 'number') return false
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false
  if (Math.abs(lat) < 1e-6 && Math.abs(lon) < 1e-6) return false
  return true
}

function readAscii(view: DataView, start: number, maxLen: number): string {
  let out = ''
  const end = Math.min(view.byteLength, start + maxLen)
  for (let i = start; i < end; i++) {
    const code = view.getUint8(i)
    if (code === 0) break
    out += String.fromCharCode(code)
  }
  return out.trim()
}

function readTagString(view: DataView, tiffStart: number, valueOffsetField: number, count: number, littleEndian: boolean): string {
  if (count <= 0) return ''
  if (count <= 4) {
    return readAscii(view, valueOffsetField, count)
  }
  const ptr = view.getUint32(valueOffsetField, littleEndian)
  if (tiffStart + ptr >= view.byteLength) return ''
  return readAscii(view, tiffStart + ptr, count)
}

function readRational(view: DataView, pos: number, littleEndian: boolean): number | undefined {
  if (pos + 8 > view.byteLength) return undefined
  const num = view.getUint32(pos, littleEndian)
  const den = view.getUint32(pos + 4, littleEndian)
  if (den === 0) return undefined
  return num / den
}

function readGpsDms(view: DataView, tiffStart: number, valueOffsetField: number, count: number, littleEndian: boolean): number | undefined {
  if (count < 3) return undefined
  const ptr = view.getUint32(valueOffsetField, littleEndian)
  const base = tiffStart + ptr
  const d = readRational(view, base, littleEndian)
  const m = readRational(view, base + 8, littleEndian)
  const s = readRational(view, base + 16, littleEndian)
  if (d === undefined || m === undefined || s === undefined) return undefined
  const decimal = d + m / 60 + s / 3600
  return Number.isFinite(decimal) ? decimal : undefined
}

interface IfdEntry {
  tag: number
  type: number
  count: number
  valueOffsetPos: number
  valueUint32: number
}

function readIfd(view: DataView, tiffStart: number, ifdOffset: number, littleEndian: boolean): IfdEntry[] {
  const start = tiffStart + ifdOffset
  if (start < 0 || start + 2 > view.byteLength) return []
  const count = view.getUint16(start, littleEndian)
  const entries: IfdEntry[] = []
  for (let i = 0; i < count; i++) {
    const entryStart = start + 2 + i * 12
    if (entryStart + 12 > view.byteLength) break
    entries.push({
      tag: view.getUint16(entryStart, littleEndian),
      type: view.getUint16(entryStart + 2, littleEndian),
      count: view.getUint32(entryStart + 4, littleEndian),
      valueOffsetPos: entryStart + 8,
      valueUint32: view.getUint32(entryStart + 8, littleEndian),
    })
  }
  return entries
}

/** 从 JPEG 二进制头解析 EXIF 拍摄时间与 GPS 经纬度（零外部依赖，兼容 Node 与浏览器） */
export function parseExifFromBuffer(buffer: ArrayBuffer): PhotoExifMetadata {
  const view = new DataView(buffer)
  if (view.byteLength < 12) return {}
  // JPEG SOI 0xFFD8
  if (view.getUint16(0, false) !== 0xffd8) return {}

  let offset = 2
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset, false)
    if (marker === 0xffda || marker === 0xffd9) break // SOS / EOI
    if ((marker & 0xff00) !== 0xff00) break
    const segLen = view.getUint16(offset + 2, false)
    if (segLen < 2) break

    // APP1 (0xFFE1) + "Exif\0\0"
    if (
      marker === 0xffe1 &&
      offset + 10 <= view.byteLength &&
      view.getUint32(offset + 4, false) === 0x45786966 &&
      view.getUint16(offset + 8, false) === 0x0000
    ) {
      const tiffStart = offset + 10
      if (tiffStart + 8 > view.byteLength) return {}
      const endianTag = view.getUint16(tiffStart, false)
      const littleEndian = endianTag === 0x4949
      if (!littleEndian && endianTag !== 0x4d4d) return {}

      const ifd0Offset = view.getUint32(tiffStart + 4, littleEndian)
      const ifd0 = readIfd(view, tiffStart, ifd0Offset, littleEndian)

      let dateTime: string | undefined
      let dateTimeOriginal: string | undefined
      let dateTimeDigitized: string | undefined
      let offsetTime: string | undefined
      let offsetTimeOriginal: string | undefined
      let offsetTimeDigitized: string | undefined
      let exifIfdPtr: number | undefined
      let gpsIfdPtr: number | undefined

      for (const e of ifd0) {
        if (e.tag === 0x0132) dateTime = readTagString(view, tiffStart, e.valueOffsetPos, e.count, littleEndian)
        if (e.tag === 0x8769) exifIfdPtr = e.valueUint32
        if (e.tag === 0x8825) gpsIfdPtr = e.valueUint32
      }

      if (exifIfdPtr !== undefined) {
        const exifIfd = readIfd(view, tiffStart, exifIfdPtr, littleEndian)
        for (const e of exifIfd) {
          if (e.tag === 0x9003) dateTimeOriginal = readTagString(view, tiffStart, e.valueOffsetPos, e.count, littleEndian)
          if (e.tag === 0x9004) dateTimeDigitized = readTagString(view, tiffStart, e.valueOffsetPos, e.count, littleEndian)
          if (e.tag === 0x9010) offsetTime = readTagString(view, tiffStart, e.valueOffsetPos, e.count, littleEndian)
          if (e.tag === 0x9011) offsetTimeOriginal = readTagString(view, tiffStart, e.valueOffsetPos, e.count, littleEndian)
          if (e.tag === 0x9012) offsetTimeDigitized = readTagString(view, tiffStart, e.valueOffsetPos, e.count, littleEndian)
        }
      }

      const occurredAt =
        parseExifDateToBeijingInput(dateTimeOriginal, offsetTimeOriginal) ||
        parseExifDateToBeijingInput(dateTimeDigitized, offsetTimeDigitized) ||
        parseExifDateToBeijingInput(dateTime, offsetTime)

      let latitude: number | undefined
      let longitude: number | undefined
      if (gpsIfdPtr !== undefined) {
        const gpsIfd = readIfd(view, tiffStart, gpsIfdPtr, littleEndian)
        let latRef = 'N'
        let lonRef = 'E'
        let rawLat: number | undefined
        let rawLon: number | undefined
        for (const e of gpsIfd) {
          if (e.tag === 0x0001) latRef = readTagString(view, tiffStart, e.valueOffsetPos, e.count, littleEndian) || 'N'
          if (e.tag === 0x0002) rawLat = readGpsDms(view, tiffStart, e.valueOffsetPos, e.count, littleEndian)
          if (e.tag === 0x0003) lonRef = readTagString(view, tiffStart, e.valueOffsetPos, e.count, littleEndian) || 'E'
          if (e.tag === 0x0004) rawLon = readGpsDms(view, tiffStart, e.valueOffsetPos, e.count, littleEndian)
        }
        if (rawLat !== undefined && rawLon !== undefined) {
          const signedLat = latRef.toUpperCase().startsWith('S') ? -rawLat : rawLat
          const signedLon = lonRef.toUpperCase().startsWith('W') ? -rawLon : rawLon
          if (isValidCoordinates(signedLat, signedLon)) {
            latitude = signedLat
            longitude = signedLon
          }
        }
      }

      return { occurredAt, latitude, longitude }
    }

    offset += 2 + segLen
  }

  return {}
}

export async function extractPhotoExif(file: Blob): Promise<PhotoExifMetadata> {
  try {
    const slice = file.slice(0, 262_144)
    const buffer = await slice.arrayBuffer()
    return parseExifFromBuffer(buffer)
  } catch {
    return {}
  }
}

function isMeaningfulPlacePart(val?: string | null): val is string {
  const s = (val || '').trim()
  if (!s) return false
  if (s.toLowerCase() === 'unnamed road') return false
  if (PURE_NUMBER_OR_HOUSE_REGEX.test(s)) return false
  return true
}

export function formatNominatimLocation(data: any): string {
  if (!data || typeof data !== 'object') return ''
  const addr = data.address
  if (!addr || typeof addr !== 'object') return ''

  const cleanAdmin = typeof addr.state === 'string' && addr.state.trim()
    ? addr.state.trim()
    : (typeof addr.province === 'string' && addr.province.trim() ? addr.province.trim() : '')
  const rawCity = addr.city || addr.municipality || addr.town || addr.state_district || cleanAdmin
  const cleanLocality = typeof rawCity === 'string' ? rawCity.trim() : ''

  const rawDistrict = addr.city_district || addr.district || addr.county || addr.borough || addr.suburb
  const cleanSub = typeof rawDistrict === 'string' && rawDistrict.trim() && rawDistrict.trim() !== cleanLocality
    ? rawDistrict.trim()
    : ''

  const rawRoad = addr.road || addr.pedestrian || addr.street
  const cleanRoad = isMeaningfulPlacePart(rawRoad) && rawRoad.trim() !== cleanLocality && rawRoad.trim() !== cleanSub
    ? rawRoad.trim()
    : ''

  const rawFeature = data.name || addr.amenity || addr.tourism || addr.leisure || addr.building || addr.shop || addr.neighbourhood || addr.quarter
  const cleanFeature = isMeaningfulPlacePart(rawFeature) &&
    rawFeature.trim() !== cleanLocality &&
    rawFeature.trim() !== cleanSub &&
    rawFeature.trim() !== cleanAdmin
    ? rawFeature.trim()
    : ''

  const detail = cleanFeature || cleanRoad || cleanSub
  if (cleanLocality && detail) {
    return detail.startsWith(cleanLocality) ? detail : `${cleanLocality} · ${detail}`
  }
  return detail || cleanLocality || ''
}

export async function reverseGeocodeCoordinates(lat: number, lon: number): Promise<string> {
  if (!isValidCoordinates(lat, lon)) return ''
  const controller = new AbortController()
  const timer = globalThis.setTimeout(() => controller.abort(), 5000)
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}&accept-language=zh-CN&zoom=16`
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    })
    if (!resp.ok) return ''
    const data = await resp.json()
    return formatNominatimLocation(data)
  } catch {
    return ''
  } finally {
    globalThis.clearTimeout(timer)
  }
}
