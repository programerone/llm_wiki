// Browser-compatible file system implementation using IndexedDB
// Falls back to Tauri APIs when running in desktop app

import type { FileNode, WikiProject } from "@/types/wiki"

const DB_NAME = "llm-wiki-files"
const DB_VERSION = 1
const STORE_NAME = "files"

interface StoredFile {
  path: string
  content: string
  isDirectory: boolean
  modified: number
}

let db: IDBDatabase | null = null

async function initDB(): Promise<IDBDatabase> {
  if (db) return db
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }
    
    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "path" })
      }
    }
  })
}

function isTauri(): boolean {
  return typeof window !== "undefined" && !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
}

// Lazy load Tauri commands only when in Tauri environment
async function getTauriFs() {
  if (!isTauri()) return null
  const { invoke } = await import("@tauri-apps/api/core")
  return { invoke }
}

export async function readFile(path: string): Promise<string> {
  const tauri = await getTauriFs()
  if (tauri) {
    return tauri.invoke<string>("read_file", { path })
  }
  
  // Browser implementation
  const database = await initDB()
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, "readonly")
    const store = tx.objectStore(STORE_NAME)
    const request = store.get(path)
    
    request.onsuccess = () => {
      const result = request.result as StoredFile | undefined
      if (result && !result.isDirectory) {
        resolve(result.content)
      } else {
        reject(new Error(`File not found: ${path}`))
      }
    }
    request.onerror = () => reject(request.error)
  })
}

export async function writeFile(path: string, contents: string): Promise<void> {
  const tauri = await getTauriFs()
  if (tauri) {
    return tauri.invoke<void>("write_file", { path, contents })
  }
  
  // Browser implementation
  const database = await initDB()
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, "readwrite")
    const store = tx.objectStore(STORE_NAME)
    const request = store.put({
      path,
      content: contents,
      isDirectory: false,
      modified: Date.now()
    })
    
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function listDirectory(path: string): Promise<FileNode[]> {
  const tauri = await getTauriFs()
  if (tauri) {
    return tauri.invoke<FileNode[]>("list_directory", { path })
  }
  
  // Browser implementation - return mock or from IndexedDB
  const database = await initDB()
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, "readonly")
    const store = tx.objectStore(STORE_NAME)
    const request = store.getAll()
    
    request.onsuccess = () => {
      const allFiles = request.result as StoredFile[]
      const nodes: FileNode[] = []
      const seen = new Set<string>()
      
      for (const file of allFiles) {
        if (file.path.startsWith(path)) {
          const relativePath = file.path.slice(path.length).replace(/^\//, "")
          const parts = relativePath.split("/").filter(Boolean)
          
          if (parts.length === 0) continue
          
          const name = parts[0]
          const isDir = parts.length > 1 || file.isDirectory
          const fullPath = path + "/" + name
          
          if (!seen.has(fullPath)) {
            seen.add(fullPath)
            nodes.push({
              name,
              path: fullPath,
              is_dir: isDir,
              children: isDir ? [] : undefined
            })
          }
        }
      }
      
      resolve(nodes)
    }
    request.onerror = () => reject(request.error)
  })
}

export async function deleteFile(path: string): Promise<void> {
  const tauri = await getTauriFs()
  if (tauri) {
    return tauri.invoke("delete_file", { path })
  }
  
  const database = await initDB()
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, "readwrite")
    const store = tx.objectStore(STORE_NAME)
    const request = store.delete(path)
    
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function createDirectory(path: string): Promise<void> {
  const tauri = await getTauriFs()
  if (tauri) {
    return tauri.invoke<void>("create_directory", { path })
  }
  
  // In browser, we just create a marker entry
  const database = await initDB()
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, "readwrite")
    const store = tx.objectStore(STORE_NAME)
    const request = store.put({
      path,
      content: "",
      isDirectory: true,
      modified: Date.now()
    })
    
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function copyFile(source: string, destination: string): Promise<void> {
  const content = await readFile(source)
  await writeFile(destination, content)
}

export async function preprocessFile(path: string): Promise<string> {
  const tauri = await getTauriFs()
  if (tauri) {
    return tauri.invoke<string>("preprocess_file", { path })
  }
  
  // Browser: extract text based on file type
  const { extractText } = await import("./browser-ingest")
  const { text } = await extractText(path)
  return text
}

export async function findRelatedWikiPages(
  projectPath: string,
  sourceName: string
): Promise<string[]> {
  const tauri = await getTauriFs()
  if (tauri) {
    return tauri.invoke<string[]>("find_related_wiki_pages", { projectPath, sourceName })
  }
  
  // Browser: return empty or search through indexed files
  return []
}

export async function createProject(name: string, path: string): Promise<WikiProject> {
  const tauri = await getTauriFs()
  if (tauri) {
    return tauri.invoke<WikiProject>("create_project", { name, path })
  }
  
  // Browser: create project in IndexedDB
  const projectPath = `${path}/${name}`
  await createDirectory(projectPath)
  await createDirectory(`${projectPath}/wiki`)
  await createDirectory(`${projectPath}/raw`)
  await createDirectory(`${projectPath}/raw/sources`)
  
  return {
    name,
    path: projectPath
  }
}

export async function openProject(path: string): Promise<WikiProject> {
  const tauri = await getTauriFs()
  if (tauri) {
    return tauri.invoke<WikiProject>("open_project", { path })
  }
  
  // Browser: extract name from path
  const parts = path.split("/")
  return {
    name: parts[parts.length - 1] || "project",
    path
  }
}

export async function clipServerStatus(): Promise<string> {
  const tauri = await getTauriFs()
  if (tauri) {
    return tauri.invoke<string>("clip_server_status")
  }
  
  return "disabled" // Not available in browser
}

export async function copyDirectory(source: string, destination: string): Promise<string[]> {
  const tauri = await getTauriFs()
  if (tauri) {
    return tauri.invoke<string[]>("copy_directory", { source, destination })
  }
  
  // Browser: Not supported - would need File System Access API with full directory access
  throw new Error("copyDirectory not supported in browser mode")
}
