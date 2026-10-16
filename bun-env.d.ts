declare module "*.css" {}

declare module "*.wasm" {
  const url: string;
  export default url;
}

// NOTE: File System Access API; Chromium only, absent from the TS DOM lib.
interface Window {
  showDirectoryPicker?: (options?: {
    id?: string;
  }) => Promise<import("./src/core/files").DirectoryEntry>;
}
