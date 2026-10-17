import JSZip from "jszip";
import {
  ImportError,
  MAX_FILE_BYTES,
  kindFromFileName,
  parseExportText,
  type ParsedDataset,
} from "./parser";

const MAX_ZIP_BYTES = 500 * 1024 * 1024; // compressed upload size
const MAX_ENTRIES = 20_000;
const MAX_TOTAL_UNCOMPRESSED = 300 * 1024 * 1024;

/**
 * Reads only the followers and following JSON/HTML files out of an Instagram export ZIP.
 * Entry count and decompressed size are bounded to defuse zip bombs; nothing is executed.
 */
export async function parseZip(file: File | Blob, name = "export.zip"): Promise<ParsedDataset[]> {
  if (file.size > MAX_ZIP_BYTES) throw new ImportError(`${name}: archive is too large.`);
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new ImportError(`${name}: not a valid ZIP archive.`);
  }

  const entries = Object.values(zip.files).filter((f) => !f.dir);
  if (entries.length > MAX_ENTRIES) throw new ImportError(`${name}: archive has too many files.`);

  const wanted = entries.filter((f) => kindFromFileName(f.name) !== "unknown");
  if (wanted.length === 0) {
    throw new ImportError(
      `${name}: no followers or following files found. Export "Followers and following" in JSON or HTML format.`,
    );
  }

  let total = 0;
  const datasets: ParsedDataset[] = [];
  for (const entry of wanted) {
    // JSZip exposes the declared uncompressed size on its internal data object.
    const declared = (entry as unknown as { _data?: { uncompressedSize?: number } })._data
      ?.uncompressedSize;
    if (typeof declared === "number") {
      if (declared > MAX_FILE_BYTES) throw new ImportError(`${entry.name}: file is too large.`);
      total += declared;
      if (total > MAX_TOTAL_UNCOMPRESSED) throw new ImportError(`${name}: archive expands too large.`);
    }
    const text = await entry.async("string");
    if (text.length > MAX_FILE_BYTES) throw new ImportError(`${entry.name}: file is too large.`);
    datasets.push(parseExportText(entry.name, text));
  }
  return datasets;
}

/** Parses any supported upload (JSON, HTML or ZIP) into datasets. */
export async function parseUpload(file: File): Promise<ParsedDataset[]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".zip")) return parseZip(file, file.name);
  if (file.size > MAX_FILE_BYTES) throw new ImportError(`${file.name}: file is too large.`);
  if (!/\.(json|html?)$/.test(lower)) {
    throw new ImportError(`${file.name}: unsupported file type. Use JSON, HTML or ZIP.`);
  }
  const text = await file.text();
  const ds = parseExportText(file.name, text);
  if (ds.kind === "unknown") {
    throw new ImportError(
      `${file.name}: could not tell if this is a followers or following file. Keep the original file name (followers_1.json / following.json).`,
    );
  }
  return [ds];
}
