import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatNominatimLocation,
  parseExifDateToBeijingInput,
  parseExifFromBuffer,
} from '../src/utils/exifReader.ts'

function buildMinimalExifJpeg(): ArrayBuffer {
  // Construct a minimal JPEG (SOI + APP1 Exif II TIFF + EOI) with:
  // - ExifIFD: DateTimeOriginal "2026:11:20 16:30:42" + OffsetTimeOriginal "+09:00"
  // - GPSIFD: N 31 deg 13 min 49.44 sec, E 121 deg 28 min 25.32 sec
  const buf = new ArrayBuffer(512)
  const view = new DataView(buf)
  const bytes = new Uint8Array(buf)

  const writeAscii = (pos: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      bytes[pos + i] = str.charCodeAt(i)
    }
    bytes[pos + str.length] = 0
  }

  let p = 0
  view.setUint16(p, 0xffd8, false); p += 2 // SOI
  view.setUint16(p, 0xffe1, false); p += 2 // APP1
  const segLenPos = p; p += 2
  writeAscii(p, 'Exif'); bytes[p + 4] = 0; bytes[p + 5] = 0; p += 6

  const tiff = p
  // Little endian "II", 42, IFD0 at offset 8
  view.setUint16(tiff, 0x4949, false)
  view.setUint16(tiff + 2, 42, true)
  view.setUint32(tiff + 4, 8, true)

  // IFD0 at tiff + 8: 2 entries (ExifIFD=0x8769, GPSIFD=0x8825)
  const ifd0 = 8
  view.setUint16(tiff + ifd0, 2, true)
  const exifIfd = ifd0 + 2 + 24 + 4
  const gpsIfd = exifIfd + 2 + 24 + 4
  const dataArea = gpsIfd + 2 + 48 + 4

  // Entry 0: 0x8769 ExifIFD
  view.setUint16(tiff + ifd0 + 2, 0x8769, true)
  view.setUint16(tiff + ifd0 + 4, 4, true)
  view.setUint32(tiff + ifd0 + 6, 1, true)
  view.setUint32(tiff + ifd0 + 10, exifIfd, true)

  // Entry 1: 0x8825 GPSIFD
  view.setUint16(tiff + ifd0 + 14, 0x8825, true)
  view.setUint16(tiff + ifd0 + 16, 4, true)
  view.setUint32(tiff + ifd0 + 18, 1, true)
  view.setUint32(tiff + ifd0 + 22, gpsIfd, true)

  // ExifIFD: 2 entries (0x9003 DateTimeOriginal, 0x9011 OffsetTimeOriginal)
  view.setUint16(tiff + exifIfd, 2, true)
  const datePtr = dataArea
  writeAscii(tiff + datePtr, '2026:11:20 16:30:42')
  const offsetPtr = datePtr + 20
  writeAscii(tiff + offsetPtr, '+09:00')

  view.setUint16(tiff + exifIfd + 2, 0x9003, true)
  view.setUint16(tiff + exifIfd + 4, 2, true)
  view.setUint32(tiff + exifIfd + 6, 20, true)
  view.setUint32(tiff + exifIfd + 10, datePtr, true)

  view.setUint16(tiff + exifIfd + 14, 0x9011, true)
  view.setUint16(tiff + exifIfd + 16, 2, true)
  view.setUint32(tiff + exifIfd + 18, 7, true)
  view.setUint32(tiff + exifIfd + 22, offsetPtr, true)

  // GPSIFD: 4 entries (0x0001 N, 0x0002 lat, 0x0003 E, 0x0004 lon)
  view.setUint16(tiff + gpsIfd, 4, true)
  const latPtr = offsetPtr + 16
  const lonPtr = latPtr + 24

  // 31, 13, 49.44
  view.setUint32(tiff + latPtr, 31, true); view.setUint32(tiff + latPtr + 4, 1, true)
  view.setUint32(tiff + latPtr + 8, 13, true); view.setUint32(tiff + latPtr + 12, 1, true)
  view.setUint32(tiff + latPtr + 16, 4944, true); view.setUint32(tiff + latPtr + 20, 100, true)

  // 121, 28, 25.32
  view.setUint32(tiff + lonPtr, 121, true); view.setUint32(tiff + lonPtr + 4, 1, true)
  view.setUint32(tiff + lonPtr + 8, 28, true); view.setUint32(tiff + lonPtr + 12, 1, true)
  view.setUint32(tiff + lonPtr + 16, 2532, true); view.setUint32(tiff + lonPtr + 20, 100, true)

  // Entry 0: 0x0001 'N'
  view.setUint16(tiff + gpsIfd + 2, 0x0001, true)
  view.setUint16(tiff + gpsIfd + 4, 2, true)
  view.setUint32(tiff + gpsIfd + 6, 2, true)
  writeAscii(tiff + gpsIfd + 10, 'N')

  // Entry 1: 0x0002 lat
  view.setUint16(tiff + gpsIfd + 14, 0x0002, true)
  view.setUint16(tiff + gpsIfd + 16, 5, true)
  view.setUint32(tiff + gpsIfd + 18, 3, true)
  view.setUint32(tiff + gpsIfd + 22, latPtr, true)

  // Entry 2: 0x0003 'E'
  view.setUint16(tiff + gpsIfd + 26, 0x0003, true)
  view.setUint16(tiff + gpsIfd + 28, 2, true)
  view.setUint32(tiff + gpsIfd + 30, 2, true)
  writeAscii(tiff + gpsIfd + 34, 'E')

  // Entry 3: 0x0004 lon
  view.setUint16(tiff + gpsIfd + 38, 0x0004, true)
  view.setUint16(tiff + gpsIfd + 40, 5, true)
  view.setUint32(tiff + gpsIfd + 42, 3, true)
  view.setUint32(tiff + gpsIfd + 46, lonPtr, true)

  const totalEnd = tiff + lonPtr + 24
  view.setUint16(segLenPos, totalEnd - segLenPos, false)
  view.setUint16(totalEnd, 0xffd9, false)
  return buf.slice(0, totalEnd + 2)
}

test('parseExifFromBuffer extracts Beijing time and GPS coordinates', () => {
  const buf = buildMinimalExifJpeg()
  const parsed = parseExifFromBuffer(buf)
  assert.equal(parsed.occurredAt, '2026-11-20T15:30')
  assert.ok(parsed.latitude && Math.abs(parsed.latitude - 31.2304) < 0.001)
  assert.ok(parsed.longitude && Math.abs(parsed.longitude - 121.4737) < 0.001)
})

test('parseExifDateToBeijingInput handles dirty zeros and offsets', () => {
  assert.equal(parseExifDateToBeijingInput('0000:00:00 00:00:00'), undefined)
  assert.equal(parseExifDateToBeijingInput('2026:11:20 07:30:00', 'Z'), '2026-11-20T15:30')
})

test('formatNominatimLocation formats readable city and landmark/road', () => {
  assert.equal(
    formatNominatimLocation({
      name: '',
      address: { road: '延安东路', city: '上海市', city_district: '黄浦区' },
    }),
    '上海市 · 延安东路',
  )
  assert.equal(
    formatNominatimLocation({
      name: '三里屯太古里',
      address: { road: '三里屯路', city: '北京市', district: '朝阳区' },
    }),
    '北京市 · 三里屯太古里',
  )
})
