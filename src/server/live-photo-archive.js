import { inflateRawSync } from "node:zlib";

export const livePhotoMaxBytes = 100 * 1024 * 1024;
export const pairMagic = "SONGQI-LIVE-1\n";
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
  return n >>> 0;
});
const crc32 = (data) => {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

// Stored ZIPs have a fixed neutral date and generic filenames, never source
// paths, upload timestamps, archive comments or OS extended attributes.
export function zipFiles(files) {
  const chunks = [], central = []; let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const filename = Buffer.from(name), crc = crc32(data), local = Buffer.alloc(30), entry = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(33, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
    entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(33, 14);
    entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(filename.length, 28); entry.writeUInt32LE(offset, 42);
    chunks.push(local, filename, data); central.push(entry, filename); offset += local.length + filename.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, directory, end]);
}

export function unpackPair(data) {
  if (data.length > livePhotoMaxBytes) throw new Error("Live Photo exceeds 100 MB");
  if (data.subarray(0, pairMagic.length).toString() === pairMagic) {
    const size = data.readUInt32BE(pairMagic.length), start = pairMagic.length + 4;
    if (!size || size > 32 * 1024 * 1024 || start + size >= data.length) throw new Error("Incomplete Live Photo pair");
    return { photo: data.subarray(start, start + size), movie: data.subarray(start + size) };
  }
  let end = data.length - 22;
  while (end >= Math.max(0, data.length - 65557) && data.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < Math.max(0, data.length - 65557)) throw new Error("Choose a Live Photo pair or a .livp archive");
  const count = data.readUInt16LE(end + 10), directoryEnd = data.readUInt32LE(end + 16) + data.readUInt32LE(end + 12);
  if (count > 32 || data.readUInt32LE(end + 4) !== 0 || directoryEnd > end) throw new Error("Unsupported Live Photo archive");
  let offset = data.readUInt32LE(end + 16), total = 0;
  const result = {};
  for (let i = 0; i < count; i++) {
    if (offset + 46 > directoryEnd || data.readUInt32LE(offset) !== 0x02014b50) throw new Error("Invalid archive directory");
    const compressed = data.readUInt32LE(offset + 20), size = data.readUInt32LE(offset + 24), nameLength = data.readUInt16LE(offset + 28);
    const name = data.toString("utf8", offset + 46, offset + 46 + nameLength);
    const next = offset + 46 + nameLength + data.readUInt16LE(offset + 30) + data.readUInt16LE(offset + 32);
    if (next > directoryEnd) throw new Error("Invalid archive name");
    total += size;
    if (total > livePhotoMaxBytes) throw new Error("Expanded Live Photo exceeds 100 MB");
    const kind = /\.(jpe?g|heic|heif)$/i.test(name) ? "photo" : /\.mov$/i.test(name) ? "movie" : null;
    if (kind && !name.startsWith("__MACOSX/") && !name.split("/").at(-1).startsWith("._")) {
      if (result[kind] || (kind === "photo" && size > 32 * 1024 * 1024)) throw new Error("Choose one photo and its paired MOV");
      const method = data.readUInt16LE(offset + 10), local = data.readUInt32LE(offset + 42);
      if (data.readUInt16LE(offset + 8) & 1 || local + 30 > data.length || data.readUInt32LE(local) !== 0x04034b50) throw new Error("Invalid or encrypted archive");
      const start = local + 30 + data.readUInt16LE(local + 26) + data.readUInt16LE(local + 28);
      if (start + compressed > data.length || ![0, 8].includes(method) || !size) throw new Error("Invalid archive entry");
      const content = data.subarray(start, start + compressed);
      const decoded = method === 8 ? inflateRawSync(content, { maxOutputLength: size }) : content;
      if (decoded.length !== size || crc32(decoded) !== data.readUInt32LE(offset + 16)) throw new Error("Damaged Live Photo archive");
      result[kind] = decoded;
    }
    offset = next;
  }
  if (!result.photo || !result.movie) throw new Error("The Live Photo needs both its original photo and MOV");
  return result;
}
