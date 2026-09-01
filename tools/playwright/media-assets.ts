import { deflateSync } from 'node:zlib';

/** Create a deterministic, metadata-free PNG for browser upload coverage. */
export function createSolidPng(
  width: number,
  height: number,
  rgb: [number, number, number],
): Buffer {
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    rows[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = y * (width * 3 + 1) + 1 + x * 3;
      rows[offset] = rgb[0] ?? 0;
      rows[offset + 1] = rgb[1] ?? 0;
      rows[offset + 2] = rgb[2] ?? 0;
    }
  }
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = chunk(
    'IHDR',
    Buffer.from([
      (width >>> 24) & 255,
      (width >>> 16) & 255,
      (width >>> 8) & 255,
      width & 255,
      (height >>> 24) & 255,
      (height >>> 16) & 255,
      (height >>> 8) & 255,
      height & 255,
      8,
      2,
      0,
      0,
      0,
    ]),
  );
  const idat = chunk('IDAT', deflateSync(rows));
  return Buffer.concat([header, ihdr, idat, chunk('IEND', Buffer.alloc(0))]);
}

function chunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.byteLength, 0);
  const crc = crc32(Buffer.concat([name, data]));
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc, 0);
  return Buffer.concat([length, name, data, checksum]);
}

function crc32(value: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
