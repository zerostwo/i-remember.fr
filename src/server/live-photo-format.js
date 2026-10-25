// Small, bounded ISO BMFF/Exif writer. Only freshly encoded media is passed to
// this writer; no source metadata boxes, timestamps or identifiers are copied.
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const str = (s) => Buffer.from(s, "ascii");
export const box = (type, ...data) => {
  const body = Buffer.concat(data);
  return Buffer.concat([u32(body.length + 8), typeof type === "number" ? u32(type) : str(type), body]);
};
const full = (type, ...data) => box(type, u32(0), ...data);
export function boxes(buffer, start = 0, end = buffer.length) {
  const result = [];
  for (let offset = start; offset < end;) {
    if (offset + 8 > end || result.length > 10000) throw new Error("Invalid media boxes");
    let size = buffer.readUInt32BE(offset), header = 8;
    if (size === 1) { if (offset + 16 > end) throw new Error("Invalid media box"); size = Number(buffer.readBigUInt64BE(offset + 8)); header = 16; }
    if (size === 0) size = end - offset;
    if (!Number.isSafeInteger(size) || size < header || offset + size > end) throw new Error("Invalid media box size");
    result.push({ type: buffer.toString("latin1", offset + 4, offset + 8), start: offset, data: offset + header, end: offset + size });
    offset += size;
  }
  return result;
}
const child = (b, parent, type) => boxes(b, parent.data, parent.end).find(x => x.type === type);

// Decode only the timed key-photo marker, never the camera/sensor metadata.
export function keyPhotoTime(buffer, probe) {
  const moov = boxes(buffer).find(x => x.type === "moov");
  if (!moov) throw new Error("Missing movie");
  for (const trak of boxes(buffer, moov.data, moov.end).filter(x => x.type === "trak")) {
    const tkhd = child(buffer, trak, "tkhd"), mdia = child(buffer, trak, "mdia");
    if (!tkhd || !mdia) continue;
    const minf = child(buffer, mdia, "minf");
    const stbl = minf && child(buffer, minf, "stbl");
    const stsd = stbl && child(buffer, stbl, "stsd");
    if (!stsd) continue;
    const mebx = boxes(buffer, stsd.data + 8, stsd.end).find(x => x.type === "mebx");
    if (!mebx) continue;
    const keys = boxes(buffer, mebx.data + 8, mebx.end).find(x => x.type === "keys");
    if (!keys) continue;
    const key = boxes(buffer, keys.data, keys.end).find(x => {
      const keyd = child(buffer, x, "keyd");
      return keyd && buffer.toString("utf8", keyd.data, keyd.end) === "mdtacom.apple.quicktime.still-image-time";
    });
    if (!key) continue;
    const keyId = buffer.readUInt32BE(key.start + 4);
    const trackId = buffer.readUInt32BE(tkhd.data + (buffer[tkhd.data] === 1 ? 20 : 12));
    const stream = probe.streams.find(s => Number(s.id) === trackId);
    for (const packet of probe.packets || []) {
      if (packet.stream_index !== stream?.index) continue;
      const pos = Number(packet.pos), size = Number(packet.size), time = Number(packet.pts_time);
      if (!Number.isSafeInteger(pos) || !Number.isSafeInteger(size) || pos < 0 || size > 1024 * 1024 || pos + size > buffer.length) throw new Error("Invalid metadata packet");
      const marker = boxes(buffer, pos, pos + size).find(x => buffer.readUInt32BE(x.start + 4) === keyId);
      if (marker && marker.end - marker.data === 1 && buffer[marker.data] === 0 && Number.isFinite(time) && time >= 0) return time;
    }
  }
  throw new Error("The Live Photo key-picture track is missing");
}

export function pairedJpeg(jpeg, identifier) {
  if (!/^[A-F0-9-]{36}$/.test(identifier) || jpeg.readUInt16BE(0) !== 0xffd8) throw new Error("Invalid JPEG pair");
  // Apple MakerNote has its own big-endian offsets. Tag 17 is the only entry.
  const maker = Buffer.concat([Buffer.from("Apple iOS\0\0\x01MM", "binary"), Buffer.from("000100110002000000250000002000000000", "hex"), str(identifier + "\0")]);
  const tiff = Buffer.concat([
    Buffer.from("4d4d002a00000008000187690004000000010000001a000000000001927c0007", "hex"),
    u32(maker.length), u32(44), u32(0), maker,
  ]);
  const payload = Buffer.concat([Buffer.from("Exif\0\0"), tiff]);
  const prefix = Buffer.alloc(4); prefix.writeUInt16BE(0xffe1); prefix.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), prefix, payload, jpeg.subarray(2)]);
}

export function pairedMov(encoded, identifier, photoTime) {
  const roots = boxes(encoded), moov = roots.find(x => x.type === "moov");
  if (!moov || moov.end !== encoded.length) throw new Error("Expected a freshly encoded movie with trailing moov");
  const children = boxes(encoded, moov.data, moov.end);
  const mvhd = children.find(x => x.type === "mvhd");
  if (!mvhd || encoded[mvhd.data] !== 0) throw new Error("Unsupported movie timescale");
  const scale = encoded.readUInt32BE(mvhd.data + 12);
  const tracks = children.filter(x => x.type === "trak");
  const trackId = 1 + Math.max(...tracks.map(t => encoded.readUInt32BE(child(encoded, t, "tkhd").data + 12)));
  const movieDuration = encoded.readUInt32BE(mvhd.data + 16);
  const start = Math.max(0, Math.min(movieDuration - 1, Math.round(photoTime * scale)));
  const duration = Math.max(1, Math.min(movieDuration - start, Math.round(scale / 30)));
  const matrix = Buffer.from("000100000000000000000000000000000001000000000000000000000000000040000000", "hex");
  const tkhd = box("tkhd", u32(15), u32(0), u32(0), u32(trackId), u32(0), u32(start + duration), Buffer.alloc(16), matrix, Buffer.alloc(8));
  const elst = full("elst", u32(2), u32(start), u32(0xffffffff), u32(0x10000), u32(duration), u32(0), u32(0x10000));
  const mdhd = full("mdhd", u32(0), u32(0), u32(scale), u32(duration), Buffer.from("55c40000", "hex"));
  const hdlr = full("hdlr", str("mhlrmeta"), Buffer.alloc(12), Buffer.from([0]));
  const keys = box("keys", box(1, box("keyd", str("mdtacom.apple.quicktime.still-image-time")), box("dtyp", u32(0), u32(65))));
  const stsd = full("stsd", u32(1), box("mebx", Buffer.from("0000000000000001", "hex"), keys));
  const stbl = box("stbl", stsd,
    full("stts", u32(1), u32(1), u32(duration)),
    full("stsc", u32(1), u32(1), u32(1), u32(1)),
    full("stsz", u32(9), u32(1)), full("stco", u32(1), u32(moov.start + 8)));
  const dinf = box("dinf", full("dref", u32(1), box("url ", u32(1))));
  const gmhd = box("gmhd", full("gmin", Buffer.from("004080008000800000000000", "hex")));
  const trak = box("trak", tkhd, box("edts", elst), box("mdia", mdhd, hdlr, box("minf", gmhd, dinf, stbl)));
  const meta = box("meta", full("hdlr", u32(0), str("mdta"), Buffer.alloc(13)),
    full("keys", u32(1), box("mdta", str("com.apple.quicktime.content.identifier"))),
    box("ilst", box(1, box("data", u32(1), u32(0), str(identifier)))));
  const header = Buffer.from(encoded.subarray(mvhd.start, mvhd.end)); header.writeUInt32BE(trackId + 1, header.length - 4);
  // Existing audio/video chunk offsets do not move. Replace the trailing moov
  // with one new timed sample and a new moov; discard all global metadata.
  return Buffer.concat([encoded.subarray(0, moov.start), box("mdat", box(1, Buffer.from([0]))),
    box("moov", header, ...tracks.map(t => encoded.subarray(t.start, t.end)), trak, meta)]);
}
