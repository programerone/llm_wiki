// Browser-compatible file upload using File System Access API or file input
// Stores uploaded files in IndexedDB via browser-fs

import { writeFile, createDirectory } from "./browser-fs"
import { normalizePath, getFileName } from "./path-utils"

export interface UploadFile {
  name: string
  content: string | ArrayBuffer
  path: string
}

/**
 * Check if File System Access API is available
 */
export function supportsFileSystemAccess(): boolean {
  return "showOpenFilePicker" in window
}

/**
 * Upload single or multiple files using File System Access API
 * Falls back to file input if not available
 */
export async function uploadFiles(
  projectPath: string,
  options?: {
    multiple?: boolean
    accept?: string
  }
): Promise<string[]> {
  const uploadedPaths: string[] = []
  const destDir = `${normalizePath(projectPath)}/raw/sources`
  
  // Try File System Access API first
  if (supportsFileSystemAccess()) {
    try {
      const pickerOpts = {
        multiple: options?.multiple ?? true,
        types: options?.accept
          ? [{ description: "Selected files", accept: { "application/octet-stream": options.accept.split(",") } }]
          : []
      }
      
      const handles = await (window as unknown as {
        showOpenFilePicker: (opts: unknown) => Promise<FileSystemFileHandle[]>
      }).showOpenFilePicker(pickerOpts)
      
      for (const handle of handles) {
        const file = await handle.getFile()
        const content = await file.text()
        const destPath = `${destDir}/${file.name}`
        await writeFile(destPath, content)
        uploadedPaths.push(destPath)
      }
      
      return uploadedPaths
    } catch (err) {
      // User cancelled or API failed - fall through to fallback
      if ((err as Error).name === "AbortError") {
        return []
      }
    }
  }
  
  // Fallback: not supported without user interaction
  throw new Error("File upload requires File System Access API. Please use the file picker button.")
}

/**
 * Upload a folder using File System Access API
 */
export async function uploadFolder(projectPath: string): Promise<string[]> {
  const uploadedPaths: string[] = []
  const destBase = `${normalizePath(projectPath)}/raw/sources`
  
  if (!("showDirectoryPicker" in window)) {
    throw new Error("Folder upload requires File System Access API which is not available in this browser.")
  }
  
  try {
    const dirHandle = await (window as unknown as {
      showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>
    }).showDirectoryPicker()
    
    const folderName = dirHandle.name
    const destDir = `${destBase}/${folderName}`
    await createDirectory(destDir)
    
    // Recursively process directory
    await processDirectory(dirHandle, destDir, uploadedPaths)
    
    return uploadedPaths
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return []
    }
    throw err
  }
}

/**
 * Recursively process a directory and its contents
 */
async function processDirectory(
  dirHandle: FileSystemDirectoryHandle,
  destPath: string,
  uploadedPaths: string[]
): Promise<void> {
  for await (const entry of (dirHandle as unknown as { values: () => AsyncIterable<FileSystemHandle> }).values()) {
    if (entry.kind === "file") {
      const fileHandle = entry as FileSystemFileHandle
      const file = await fileHandle.getFile()
      const content = await file.text()
      const fileDest = `${destPath}/${file.name}`
      await writeFile(fileDest, content)
      uploadedPaths.push(fileDest)
    } else if (entry.kind === "directory") {
      const subDirHandle = entry as FileSystemDirectoryHandle
      const subDest = `${destPath}/${entry.name}`
      await createDirectory(subDest)
      await processDirectory(subDirHandle, subDest, uploadedPaths)
    }
  }
}

/**
 * Read files from a traditional file input element
 * Call this from an onChange handler
 */
export async function readFilesFromInput(
  files: FileList | null,
  projectPath: string
): Promise<string[]> {
  if (!files || files.length === 0) {
    return []
  }
  
  const uploadedPaths: string[] = []
  const destDir = `${normalizePath(projectPath)}/raw/sources`
  
  for (const file of Array.from(files)) {
    const content = await file.text()
    const destPath = `${destDir}/${file.name}`
    await writeFile(destPath, content)
    uploadedPaths.push(destPath)
  }
  
  return uploadedPaths
}
