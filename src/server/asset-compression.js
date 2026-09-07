import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";

const brotli = promisify(brotliCompress);
const gz = promisify(gzip);

export async function compressAssets(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await compressAssets(path);
    } else if (entry.isFile() && /\.(?:js|css|html|svg|json|webmanifest)$/.test(entry.name)) {
      const source = await readFile(path);
      if (source.length < 1024) continue;
      // Work happens at build time, never on the request path. Limit concurrency
      // to one asset so large archives do not multiply build memory consumption.
      const outputs = await Promise.all([
        brotli(source, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }),
        gz(source, { level: 9 }),
      ]);
      for (const [index, suffix] of [".br", ".gz"].entries()) {
        if (outputs[index].length < source.length) await writeFile(path + suffix, outputs[index]);
      }
    }
  }
}

export function precompressAssets() {
  let output;
  return {
    name: "precompress-static-assets",
    apply: "build",
    configResolved(config) {
      output = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      await compressAssets(output);
    },
  };
}
