// File system commands - automatically uses Tauri in desktop app, IndexedDB in browser
export {
  readFile,
  writeFile,
  listDirectory,
  copyFile,
  preprocessFile,
  deleteFile,
  findRelatedWikiPages,
  createDirectory,
  createProject,
  openProject,
  clipServerStatus,
  copyDirectory,
} from "@/lib/browser-fs"
