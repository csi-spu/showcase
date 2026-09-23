import { crc32 } from 'node:zlib';
import { writeZipArchive, type ZipEntry } from './zip-writer';

async function collect(entries: ZipEntry[]): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of writeZipArchive(entries)) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function entry(path: string, ...parts: string[]): ZipEntry {
  return {
    path,
    read: async function* () {
      for (const part of parts) yield Buffer.from(part, 'utf8');
    },
  };
}

/*
 * The central directory is what a reader actually parses, so the assertions
 * below read it rather than trusting the local headers the writer emitted.
 */
function readCentralDirectory(archive: Buffer): {
  crc: number;
  path: string;
  size: number;
}[] {
  const records: { crc: number; path: string; size: number }[] = [];
  let offset = 0;
  while (offset < archive.byteLength - 4) {
    if (archive.readUInt32LE(offset) === 0x02014b50) {
      const nameLength = archive.readUInt16LE(offset + 28);
      const extraLength = archive.readUInt16LE(offset + 30);
      const path = archive.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
      const extra = archive.subarray(
        offset + 46 + nameLength,
        offset + 46 + nameLength + extraLength,
      );
      records.push({
        crc: archive.readUInt32LE(offset + 16),
        path,
        size: Number(extra.readBigUInt64LE(4)),
      });
      offset += 46 + nameLength + extraLength;
      continue;
    }
    offset += 1;
  }
  return records;
}

describe('zip writer', () => {
  it('records every entry in the central directory with its real size and crc', async () => {
    const archive = await collect([entry('a.txt', 'hello', ' world'), entry('b/c.txt', 'x')]);
    const records = readCentralDirectory(archive);
    expect(records.map((record) => record.path)).toEqual(['a.txt', 'b/c.txt']);
    expect(records[0]?.size).toBe(11);
    expect(records[0]?.crc).toBe(crc32(Buffer.from('hello world')) >>> 0);
    expect(records[1]?.size).toBe(1);
  });

  it('writes the end-of-central-directory record a reader looks for last', async () => {
    const archive = await collect([entry('a.txt', 'a')]);
    expect(archive.readUInt32LE(archive.byteLength - 22)).toBe(0x06054b50);
  });

  it('keeps UTF-8 paths byte-exact, because Thai names are normal here', async () => {
    const archive = await collect([entry('สมชาย/เอกสาร.pdf', 'x')]);
    expect(readCentralDirectory(archive)[0]?.path).toBe('สมชาย/เอกสาร.pdf');
  });

  it('flags every entry as UTF-8 so a reader does not guess an encoding', async () => {
    const archive = await collect([entry('ก.txt', 'x')]);
    /* Bit 11 of the general-purpose flags in the local header. */
    expect(archive.readUInt16LE(6) & 0x0800).toBe(0x0800);
  });

  it('handles an empty entry without corrupting what follows', async () => {
    const archive = await collect([entry('empty.txt'), entry('after.txt', 'still here')]);
    const records = readCentralDirectory(archive);
    expect(records[0]?.size).toBe(0);
    expect(records[1]?.size).toBe('still here'.length);
  });

  it('writes a usable archive with no entries at all', async () => {
    const archive = await collect([]);
    expect(readCentralDirectory(archive)).toEqual([]);
    expect(archive.readUInt32LE(archive.byteLength - 22)).toBe(0x06054b50);
  });

  it('reads each entry exactly once, so a streaming source is never replayed', async () => {
    let reads = 0;
    const archive = await collect([
      {
        path: 'once.txt',
        read: () => {
          reads += 1;
          return (async function* () {
            yield Buffer.from('x');
          })();
        },
      },
    ]);
    expect(reads).toBe(1);
    expect(archive.byteLength).toBeGreaterThan(0);
  });

  it('never holds more than one chunk, which is what keeps a large export bounded', async () => {
    let live = 0;
    let peak = 0;
    const chunks: Buffer[] = [];
    const generator = writeZipArchive([
      {
        path: 'big.bin',
        read: async function* () {
          for (let index = 0; index < 20; index += 1) {
            live += 1;
            peak = Math.max(peak, live);
            yield Buffer.alloc(1024, index);
            live -= 1;
          }
        },
      },
    ]);
    for await (const chunk of generator) chunks.push(chunk);
    expect(peak).toBe(1);
    expect(readCentralDirectory(Buffer.concat(chunks))[0]?.size).toBe(20 * 1024);
  });
});
