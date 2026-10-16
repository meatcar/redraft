/** A text file in the context folder, addressed by its path inside the folder. */
export type SourceFile = {
  path: string;
  lastModified: number;
  size: number;
  /** Reads the file as it is now, which may differ from the listed metadata. */
  open: () => Promise<File>;
};

/** A folder the user picked; list() returns what is in it right now. */
export type FileSource = { name: string; list: () => Promise<SourceFile[]> };

const IGNORED_DIRS = new Set(["node_modules", ".git"]);

export const isIgnoredPath = (path: string) =>
  path.split("/").some((segment) => IGNORED_DIRS.has(segment));

type FileEntry = { kind: "file"; name: string; getFile: () => Promise<File> };

/** The part of FileSystemDirectoryHandle the walk uses. */
export type DirectoryEntry = {
  kind: "directory";
  name: string;
  values: () => AsyncIterable<DirectoryEntry | FileEntry>;
};

// NOTE: adapted from browser-fs-access getFiles(), © 2020 Google LLC, Apache-2.0. Modified: TS port, lazy reads, relative paths, skipped dirs.
// see https://github.com/GoogleChromeLabs/browser-fs-access/blob/main/src/fs-access/directory-open.mjs
async function walk(dir: DirectoryEntry, prefix: string): Promise<SourceFile[]> {
  const dirs: Promise<SourceFile[]>[] = [];
  const files: Promise<SourceFile>[] = [];
  for await (const entry of dir.values()) {
    const path = `${prefix}${entry.name}`;
    if (entry.kind === "file") {
      const open = () => entry.getFile();
      files.push(open().then(({ lastModified, size }) => ({ path, lastModified, size, open })));
    } else if (!IGNORED_DIRS.has(entry.name)) {
      dirs.push(walk(entry, `${path}/`));
    }
  }
  return [...(await Promise.all(dirs)).flat(), ...(await Promise.all(files))];
}

/**
 * A File System Access directory, walked again on every list() so edits, additions, and
 * deletions show up. Files are read lazily through their handles.
 */
export function directorySource(root: DirectoryEntry): FileSource {
  return { name: root.name, list: () => walk(root, "") };
}

/** Files from `<input webkitdirectory>`: a snapshot taken when the user picked the folder. */
export function snapshotSource(files: readonly File[]): FileSource {
  const name = files[0]?.webkitRelativePath.split("/")[0] ?? "folder";
  const entries = files.map((file) => ({
    path: file.webkitRelativePath.split("/").slice(1).join("/") || file.name,
    lastModified: file.lastModified,
    size: file.size,
    open: async () => file,
  }));
  return { name, list: async () => entries };
}
