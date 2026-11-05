const HASH_CHUNK_BYTES = 4 * 1024 * 1024;

export async function sha256File(file: Pick<File, 'size' | 'slice'>) {
  const { createSHA256 } = await import('hash-wasm');
  const hasher = await createSHA256();
  hasher.init();
  for (let offset = 0; offset < file.size; offset += HASH_CHUNK_BYTES) {
    const chunk = file.slice(offset, Math.min(offset + HASH_CHUNK_BYTES, file.size));
    hasher.update(new Uint8Array(await chunk.arrayBuffer()));
  }
  return hasher.digest('hex');
}
