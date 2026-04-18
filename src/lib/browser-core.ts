// Browser-compatible wrappers for Tauri core APIs

function isTauri(): boolean {
  return typeof window !== "undefined" && !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
}

/**
 * Convert a file path to a URL that can be used in the webview.
 * In browser mode, this returns an empty string since we don't have direct file access.
 */
export function convertFileSrc(filePath: string): string {
  if (isTauri()) {
    // In Tauri, use the actual API
    const tauri = window as unknown as { __TAURI__?: { convertFileSrc?: (path: string) => string } }
    if (tauri.__TAURI__?.convertFileSrc) {
      return tauri.__TAURI__.convertFileSrc(filePath)
    }
  }
  
  // In browser mode, we can't access local files directly
  // Return empty string - the component should handle this gracefully
  return ""
}

/**
 * Invoke a Tauri command.
 * In browser mode, this throws an error since native commands aren't available.
 */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri()) {
    const { invoke: tauriInvoke } = await import("@tauri-apps/api/core")
    return tauriInvoke<T>(cmd, args)
  }
  
  throw new Error(`Tauri command "${cmd}" not available in browser mode`)
}
