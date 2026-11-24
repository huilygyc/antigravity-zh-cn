'use strict';

/**
 * Pure Node.js standard-library ASAR reader & writer.
 *
 * Strictly implements Chromium Pickle framing (4-byte aligned header JSON),
 * preserves `unpacked`, `executable`, and `link` entries verbatim, and computes
 * SHA-256 block integrity hashes matching official `@electron/asar` output.
 *
 * Zero external dependencies — runs directly on Antigravity's embedded Node
 * runtime (`ELECTRON_RUN_AS_NODE=1`) or any standard Node.js >= 16.
 */

if (typeof process !== 'undefined') {
  process.noAsar = true;
}
let fs;
try {
  // 在 ELECTRON_RUN_AS_NODE=1 环境下优先使用原始 fs，避免 Electron 将 .asar 拦截成虚拟目录
  fs = require('original-fs');
} catch (_) {
  fs = require('fs');
}
const crypto = require('crypto');

const INTEGRITY_BLOCK_SIZE = 4 * 1024 * 1024; // 4 MiB (official Electron ASAR default)

/**
 * Computes Electron ASAR integrity metadata for a file buffer.
 * @param {Buffer} buf
 */
function computeIntegrity(buf) {
  const fullHash = crypto.createHash('sha256').update(buf).digest('hex');
  const blocks = [];
  if (buf.length === 0) {
    blocks.push(fullHash);
  } else {
    for (let offset = 0; offset < buf.length; offset += INTEGRITY_BLOCK_SIZE) {
      const slice = buf.subarray(offset, Math.min(offset + INTEGRITY_BLOCK_SIZE, buf.length));
      blocks.push(crypto.createHash('sha256').update(slice).digest('hex'));
    }
  }
  return {
    algorithm: 'SHA256',
    hash: fullHash,
    blockSize: INTEGRITY_BLOCK_SIZE,
    blocks,
  };
}

/**
 * Reads and parses the Pickle header of an ASAR archive.
 * @param {string} asarPath
 * @returns {{ header: object, headerSize: number, dataOffset: number, fileSize: number }}
 */
function readAsarHeader(asarPath) {
  const stat = fs.statSync(asarPath);
  const fd = fs.openSync(asarPath, 'r');
  try {
    const prefix = Buffer.alloc(16);
    const bytesRead = fs.readSync(fd, prefix, 0, 16, 0);
    if (bytesRead < 16) {
      throw new Error('无效的 ASAR 文件：文件长度小于 16 字节。');
    }

    const outerPayloadSize = prefix.readUInt32LE(0);
    const headerSize = prefix.readUInt32LE(4);
    const innerPayloadSize = prefix.readUInt32LE(8);
    const jsonByteLen = prefix.readUInt32LE(12);

    if (outerPayloadSize !== 4) {
      throw new Error(`无效的 ASAR Pickle 头：outerPayloadSize=${outerPayloadSize} (期望 4)`);
    }
    if (headerSize < innerPayloadSize + 4 || jsonByteLen > innerPayloadSize) {
      throw new Error('ASAR 头长度校验失败，文件可能已损坏。');
    }

    const dataOffset = 8 + headerSize;
    if (dataOffset > stat.size) {
      throw new Error('ASAR 数据偏移超出文件大小。');
    }

    const jsonBuf = Buffer.alloc(jsonByteLen);
    fs.readSync(fd, jsonBuf, 0, jsonByteLen, 16);
    const header = JSON.parse(jsonBuf.toString('utf8'));

    return { header, headerSize, dataOffset, fileSize: stat.size };
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Looks up a node in the parsed ASAR header tree by POSIX path.
 * @param {object} header
 * @param {string} relPath e.g. "dist/main.js"
 */
function findNode(header, relPath) {
  const parts = relPath.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  let cur = header;
  for (const part of parts) {
    if (!cur || !cur.files || !Object.prototype.hasOwnProperty.call(cur.files, part)) {
      return null;
    }
    cur = cur.files[part];
  }
  return cur;
}

/**
 * Reads a single packed file's bytes from an ASAR archive.
 * @param {string} asarPath
 * @param {string} relPath
 * @returns {Buffer}
 */
function readAsarFile(asarPath, relPath) {
  const { header, dataOffset } = readAsarHeader(asarPath);
  const node = findNode(header, relPath);
  if (!node) {
    throw new Error(`ASAR 中找不到文件: ${relPath}`);
  }
  if (node.files) {
    throw new Error(`目标路径是目录而非文件: ${relPath}`);
  }
  if (node.unpacked) {
    throw new Error(`文件位于 app.asar.unpacked 而非包内: ${relPath}`);
  }
  const offset = Number(node.offset);
  const size = Number(node.size);
  const buf = Buffer.alloc(size);
  const fd = fs.openSync(asarPath, 'r');
  try {
    let totalRead = 0;
    while (totalRead < size) {
      const n = fs.readSync(fd, buf, totalRead, size - totalRead, dataOffset + offset + totalRead);
      if (n <= 0) break;
      totalRead += n;
    }
    if (totalRead !== size) {
      throw new Error(`读取 ASAR 文件截断: ${relPath} (${totalRead}/${size})`);
    }
    return buf;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Deep-clones a JSON-compatible object.
 */
function cloneJson(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Ensures parent directories exist in the ASAR header tree and returns the parent directory node.
 */
function ensureDirNode(root, dirParts) {
  let cur = root;
  for (const part of dirParts) {
    if (!cur.files) cur.files = {};
    if (!cur.files[part]) {
      cur.files[part] = { files: {} };
    }
    cur = cur.files[part];
  }
  if (!cur.files) cur.files = {};
  return cur;
}

/**
 * Encodes an ASAR JSON header into a Chromium Pickle buffer (exact 4-byte alignment).
 * @param {object} headerObj
 * @returns {Buffer}
 */
function encodePickleHeader(headerObj) {
  const jsonBuf = Buffer.from(JSON.stringify(headerObj), 'utf8');
  const jsonLen = jsonBuf.length;
  const alignedJsonLen = Math.ceil(jsonLen / 4) * 4;
  const innerPayloadSize = alignedJsonLen + 4; // 4 bytes for jsonLen + aligned json
  const headerSize = innerPayloadSize + 4;     // 4 bytes for innerPayloadSize + innerPayload

  const out = Buffer.alloc(8 + headerSize, 0);
  out.writeUInt32LE(4, 0);                 // outer pickle payload size
  out.writeUInt32LE(headerSize, 4);        // outer pickle uint32 value (= inner pickle total bytes)
  out.writeUInt32LE(innerPayloadSize, 8);  // inner pickle payload size
  out.writeUInt32LE(jsonLen, 12);          // inner pickle string length
  jsonBuf.copy(out, 16);
  return out;
}

/**
 * Rebuilds an ASAR archive with replaced/added files and optional deleted paths,
 * preserving all untouched files, unpacked entries, executable flags, and integrity hashes.
 *
 * @param {string} srcAsarPath
 * @param {string} dstAsarPath
 * @param {Map<string, Buffer> | Record<string, Buffer>} replacements  POSIX relPath -> Buffer
 * @param {string[]} [removals]  POSIX relPaths (files or directories) to delete if present
 */
function rebuildAsar(srcAsarPath, dstAsarPath, replacements, removals = []) {
  const repMap = replacements instanceof Map
    ? new Map(Array.from(replacements.entries()).map(([k, v]) => [k.replace(/^\/+|\/+$/g, ''), v]))
    : new Map(Object.entries(replacements).map(([k, v]) => [k.replace(/^\/+|\/+$/g, ''), v]));

  const removeSet = new Set(removals.map((p) => p.replace(/^\/+|\/+$/g, '')));

  const { header: srcHeader, dataOffset: srcDataOffset } = readAsarHeader(srcAsarPath);
  const newHeader = cloneJson(srcHeader);

  // Remove specified paths if present
  for (const remPath of removeSet) {
    const parts = remPath.split('/').filter(Boolean);
    if (parts.length === 0) continue;
    const leaf = parts.pop();
    const parent = parts.length === 0 ? newHeader : findNode(newHeader, parts.join('/'));
    if (parent && parent.files && Object.prototype.hasOwnProperty.call(parent.files, leaf)) {
      delete parent.files[leaf];
    }
  }

  // Insert/overwrite replacement entries in header tree (placeholders for offset/size/integrity)
  for (const [relPath, buf] of repMap.entries()) {
    const parts = relPath.split('/').filter(Boolean);
    const fileName = parts.pop();
    const parent = ensureDirNode(newHeader, parts);
    const prev = parent.files[fileName] || {};
    const entry = {
      size: buf.length,
      offset: '0',
      integrity: computeIntegrity(buf),
    };
    if (prev.executable) {
      entry.executable = true;
    }
    parent.files[fileName] = entry;
  }

  // Collect ordered payload chunks and assign new sequential offsets
  const chunks = []; // { kind: 'src', srcOffset, size } | { kind: 'buf', buf }
  let nextOffset = 0;

  function assignOffsets(node, prefix = '') {
    if (!node || !node.files) return;
    for (const name of Object.keys(node.files)) {
      const child = node.files[name];
      const rel = prefix ? `${prefix}/${name}` : name;
      if (child.files) {
        assignOffsets(child, rel);
      } else if (child.unpacked || child.link !== undefined) {
        // Leave unpacked files & symlinks untouched
      } else if (repMap.has(rel)) {
        const buf = repMap.get(rel);
        child.size = buf.length;
        child.offset = String(nextOffset);
        chunks.push({ kind: 'buf', buf });
        nextOffset += buf.length;
      } else {
        const origNode = findNode(srcHeader, rel);
        if (!origNode) {
          throw new Error(`内部错误：原 ASAR 中找不到条目 ${rel}`);
        }
        const size = Number(origNode.size);
        const origOffset = Number(origNode.offset);
        child.offset = String(nextOffset);
        chunks.push({ kind: 'src', srcOffset: srcDataOffset + origOffset, size });
        nextOffset += size;
      }
    }
  }

  assignOffsets(newHeader);

  const headerBuf = encodePickleHeader(newHeader);

  const srcFd = fs.openSync(srcAsarPath, 'r');
  const dstFd = fs.openSync(dstAsarPath, 'w');
  const copyBuf = Buffer.alloc(1024 * 1024); // 1 MiB streaming copy buffer
  try {
    fs.writeSync(dstFd, headerBuf, 0, headerBuf.length);

    for (const chunk of chunks) {
      if (chunk.kind === 'buf') {
        if (chunk.buf.length > 0) {
          fs.writeSync(dstFd, chunk.buf, 0, chunk.buf.length);
        }
      } else {
        let remaining = chunk.size;
        let readPos = chunk.srcOffset;
        while (remaining > 0) {
          const toRead = Math.min(remaining, copyBuf.length);
          const n = fs.readSync(srcFd, copyBuf, 0, toRead, readPos);
          if (n <= 0) {
            throw new Error(`复制 ASAR 数据块失败（offset=${readPos}, remaining=${remaining}）`);
          }
          fs.writeSync(dstFd, copyBuf, 0, n);
          readPos += n;
          remaining -= n;
        }
      }
    }
  } finally {
    fs.closeSync(srcFd);
    fs.closeSync(dstFd);
  }
}

module.exports = {
  computeIntegrity,
  readAsarHeader,
  findNode,
  readAsarFile,
  encodePickleHeader,
  rebuildAsar,
};
