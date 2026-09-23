/*
 * A minimal streaming ZIP writer.
 *
 * Exports can contain hundreds of 5 MB documents, so nothing here accumulates
 * the archive: `writeZipArchive` yields chunks as entries are added and the
 * caller streams them straight to storage. Only one entry's bytes are in
 * memory at a time.
 *
 * Deliberately hand-rolled rather than pulled from a dependency, because the
 * three things that matter for this export — bounded memory, traversal-safe
 * paths, and no surprise behaviour on Thai filenames — are easier to prove in
 * eighty lines than to audit in a package.
 */

import { crc32 } from 'node:zlib';

/* ZIP format constants, named so the offsets below read as intent. */
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP64_END_SIGNATURE = 0x06064b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const ZIP64_EXTRA_FIELD_ID = 0x0001;

/*
 * Entries are stored, not deflated. Submitted documents are PDF, DOCX, XLSX,
 * JPEG and PNG — all already compressed — so deflating them would spend CPU on
 * every export to save almost nothing. Storing also means the compressed size
 * is known before the bytes are written, which keeps the writer streaming.
 */
const STORED_METHOD = 0;
/* Version 4.5, the minimum that understands the ZIP64 records written below. */
const ZIP64_VERSION = 45;
/* Bit 11: the name and comment are UTF-8, which Thai filenames require. */
const UTF8_NAME_FLAG = 0x0800;

/* Above this, a 32-bit field cannot hold the value and ZIP64 is required. */
const UINT32_MAX = 0xffffffff;

export interface ZipEntry {
  /** The path inside the archive. Already sanitized by the caller. */
  path: string;
  /** Yields the entry's bytes. Called exactly once. */
  read: () => AsyncIterable<Buffer>;
}

interface CentralRecord {
  crc: number;
  localHeaderOffset: number;
  path: Buffer;
  size: number;
}

/**
 * Streams a ZIP archive over the given entries.
 *
 * ZIP64 records are always written rather than only past 4 GB: an export of
 * many documents can cross the 32-bit limits, and a reader that cannot parse
 * ZIP64 cannot open a large export anyway.
 */
export async function* writeZipArchive(
  entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>,
): AsyncGenerator<Buffer> {
  const central: CentralRecord[] = [];
  let offset = 0;

  for await (const entry of entries) {
    const path = Buffer.from(entry.path, 'utf8');
    const localHeaderOffset = offset;

    /*
     * The size and CRC are unknown until the bytes have been read, and this
     * writer refuses to buffer them to find out. The data descriptor that
     * follows the entry carries both, which is exactly what the streaming flag
     * in the general-purpose bit field announces.
     */
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(LOCAL_HEADER_SIGNATURE, 0);
    localHeader.writeUInt16LE(ZIP64_VERSION, 4);
    localHeader.writeUInt16LE(UTF8_NAME_FLAG, 6);
    localHeader.writeUInt16LE(STORED_METHOD, 8);
    localHeader.writeUInt16LE(0, 10); /* modification time */
    localHeader.writeUInt16LE(0, 12); /* modification date */
    localHeader.writeUInt32LE(0, 14); /* crc, in the central directory */
    localHeader.writeUInt32LE(UINT32_MAX, 18); /* compressed size, see ZIP64 */
    localHeader.writeUInt32LE(UINT32_MAX, 22); /* uncompressed size, see ZIP64 */
    localHeader.writeUInt16LE(path.byteLength, 26);
    localHeader.writeUInt16LE(20, 28); /* the ZIP64 extra field below */

    const localExtra = Buffer.alloc(20);
    localExtra.writeUInt16LE(ZIP64_EXTRA_FIELD_ID, 0);
    localExtra.writeUInt16LE(16, 2);
    /* Both sizes are patched in the central directory, so zero is correct here. */
    yield Buffer.concat([localHeader, path, localExtra]);
    offset += localHeader.byteLength + path.byteLength + localExtra.byteLength;

    let size = 0;
    let crc = 0;
    for await (const chunk of entry.read()) {
      if (chunk.byteLength === 0) continue;
      crc = crc32(chunk, crc);
      size += chunk.byteLength;
      offset += chunk.byteLength;
      yield chunk;
    }

    /* The descriptor the streaming flag promised: signature, crc, both sizes. */
    const descriptor = Buffer.alloc(24);
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(crc >>> 0, 4);
    descriptor.writeBigUInt64LE(BigInt(size), 8);
    descriptor.writeBigUInt64LE(BigInt(size), 16);
    yield descriptor;
    offset += descriptor.byteLength;

    central.push({ crc: crc >>> 0, localHeaderOffset, path, size });
  }

  const directoryOffset = offset;
  let directorySize = 0;
  for (const record of central) {
    const header = Buffer.alloc(46);
    header.writeUInt32LE(CENTRAL_HEADER_SIGNATURE, 0);
    header.writeUInt16LE(ZIP64_VERSION, 4); /* made by */
    header.writeUInt16LE(ZIP64_VERSION, 6); /* needed to extract */
    header.writeUInt16LE(UTF8_NAME_FLAG, 8);
    header.writeUInt16LE(STORED_METHOD, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt16LE(0, 14);
    header.writeUInt32LE(record.crc, 16);
    header.writeUInt32LE(UINT32_MAX, 20);
    header.writeUInt32LE(UINT32_MAX, 24);
    header.writeUInt16LE(record.path.byteLength, 28);
    header.writeUInt16LE(28, 30); /* extra field length */
    header.writeUInt16LE(0, 32); /* comment length */
    header.writeUInt16LE(0, 34); /* disk number */
    header.writeUInt16LE(0, 36); /* internal attributes */
    header.writeUInt32LE(0, 38); /* external attributes */
    header.writeUInt32LE(UINT32_MAX, 42); /* local header offset, see ZIP64 */

    const extra = Buffer.alloc(28);
    extra.writeUInt16LE(ZIP64_EXTRA_FIELD_ID, 0);
    extra.writeUInt16LE(24, 2);
    extra.writeBigUInt64LE(BigInt(record.size), 4); /* uncompressed */
    extra.writeBigUInt64LE(BigInt(record.size), 12); /* compressed */
    extra.writeBigUInt64LE(BigInt(record.localHeaderOffset), 20);

    yield Buffer.concat([header, record.path, extra]);
    directorySize += header.byteLength + record.path.byteLength + extra.byteLength;
  }

  const zip64End = Buffer.alloc(56);
  zip64End.writeUInt32LE(ZIP64_END_SIGNATURE, 0);
  zip64End.writeBigUInt64LE(BigInt(44), 4); /* size of the rest of this record */
  zip64End.writeUInt16LE(ZIP64_VERSION, 12);
  zip64End.writeUInt16LE(ZIP64_VERSION, 14);
  zip64End.writeUInt32LE(0, 16); /* this disk */
  zip64End.writeUInt32LE(0, 20); /* disk with the directory */
  zip64End.writeBigUInt64LE(BigInt(central.length), 24);
  zip64End.writeBigUInt64LE(BigInt(central.length), 32);
  zip64End.writeBigUInt64LE(BigInt(directorySize), 40);
  zip64End.writeBigUInt64LE(BigInt(directoryOffset), 48);
  yield zip64End;

  const locator = Buffer.alloc(20);
  locator.writeUInt32LE(ZIP64_LOCATOR_SIGNATURE, 0);
  locator.writeUInt32LE(0, 4);
  locator.writeBigUInt64LE(BigInt(directoryOffset + directorySize), 8);
  locator.writeUInt32LE(1, 16); /* total disks */
  yield locator;

  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  /*
   * The 32-bit mirrors of the ZIP64 record. Saturating them is what tells a
   * reader to look at the ZIP64 record for the real values.
   */
  end.writeUInt16LE(Math.min(central.length, 0xffff), 8);
  end.writeUInt16LE(Math.min(central.length, 0xffff), 10);
  end.writeUInt32LE(Math.min(directorySize, UINT32_MAX), 12);
  end.writeUInt32LE(Math.min(directoryOffset, UINT32_MAX), 16);
  end.writeUInt16LE(0, 20); /* comment length */
  yield end;
}
