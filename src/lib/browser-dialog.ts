// Browser-compatible dialog implementation
// Uses File System Access API when available, falls back to simple prompts

export interface DialogFilter {
  name: string
  extensions: string[]
}

function isTauri(): boolean {
  return typeof window !== "undefined" && !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
}

export async function open(options?: {
  directory?: boolean
  multiple?: boolean
  filters?: DialogFilter[]
  defaultPath?: string
  title?: string
}): Promise<string | null> {
  const tauri = await (async () => {
    if (!isTauri()) return null
    const { open } = await import("@tauri-apps/plugin-dialog")
    return { open }
  })()
  
  if (tauri) {
    return tauri.open(options)
  }
  
  // Browser implementation
  if (options?.directory) {
    // Use File System Access API for directory selection
    if ("showDirectoryPicker" in window) {
      try {
        const dirHandle = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker()
        return dirHandle.name
      } catch {
        return null
      }
    }
    
    // Fallback: prompt for path
    const title = options?.title || "Select directory"
    const name = prompt(title, options?.defaultPath || "my-wiki")
    if (!name) return null
    return name
  }
  
  // File selection
  if ("showOpenFilePicker" in window) {
    try {
      const pickerOpts = {
        types: options?.filters?.map(f => ({
          description: f.name,
          accept: { "application/octet-stream": f.extensions.map(e => `.${e}`) }
        })) || []
      }
      const [fileHandle] = await (window as unknown as { showOpenFilePicker: (opts: unknown) => Promise<FileSystemFileHandle[]> }).showOpenFilePicker(pickerOpts)
      return fileHandle.name
    } catch {
      return null
    }
  }
  
  return null
}

export async function save(options?: {
  filters?: DialogFilter[]
  defaultPath?: string
}): Promise<string | null> {
  const tauri = await (async () => {
    if (!isTauri()) return null
    const { save } = await import("@tauri-apps/plugin-dialog")
    return { save }
  })()
  
  if (tauri) {
    return tauri.save(options)
  }
  
  // Browser implementation
  if ("showSaveFilePicker" in window) {
    try {
      const pickerOpts = {
        suggestedName: options?.defaultPath,
        types: options?.filters?.map(f => ({
          description: f.name,
          accept: { "application/octet-stream": f.extensions.map(e => `.${e}`) }
        })) || []
      }
      const fileHandle = await (window as unknown as { showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker(pickerOpts)
      return fileHandle.name
    } catch {
      return null
    }
  }
  
  return options?.defaultPath || null
}
