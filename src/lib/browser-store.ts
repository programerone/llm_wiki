// Browser-compatible store implementation using localStorage
// Falls back to Tauri plugin-store when in desktop app

import type { WikiProject } from "@/types/wiki"
import type { LlmConfig, SearchApiConfig, EmbeddingConfig } from "@/stores/wiki-store"

function isTauri(): boolean {
  return typeof window !== "undefined" && !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
}

// Tauri store wrapper
class TauriStore {
  private store: Awaited<ReturnType<typeof import("@tauri-apps/plugin-store").load>> | null = null
  
  async init() {
    if (!this.store && isTauri()) {
      const { load } = await import("@tauri-apps/plugin-store")
      this.store = await load("app-state.json", { autoSave: true, defaults: {} })
    }
    return this.store
  }
  
  async get<T>(key: string): Promise<T | null> {
    const store = await this.init()
    const value = await store?.get<T>(key)
    return value ?? null
  }
  
  async set(key: string, value: unknown): Promise<void> {
    const store = await this.init()
    await store?.set(key, value)
  }
}

// Browser localStorage wrapper
class BrowserStore {
  private prefix = "llm-wiki:"
  
  get<T>(key: string): T | null {
    try {
      const item = localStorage.getItem(this.prefix + key)
      return item ? JSON.parse(item) : null
    } catch {
      return null
    }
  }
  
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(value))
    } catch {
      // Ignore storage errors
    }
  }
}

const tauriStore = new TauriStore()
const browserStore = new BrowserStore()

async function get<T>(key: string): Promise<T | null> {
  if (isTauri()) {
    return tauriStore.get<T>(key)
  }
  return browserStore.get<T>(key)
}

async function set(key: string, value: unknown): Promise<void> {
  if (isTauri()) {
    return tauriStore.set(key, value)
  }
  browserStore.set(key, value)
}

// Export functions matching the original API
export async function getRecentProjects(): Promise<WikiProject[]> {
  return (await get<WikiProject[]>("recentProjects")) ?? []
}

export async function getLastProject(): Promise<WikiProject | null> {
  return await get<WikiProject>("lastProject")
}

export async function saveLastProject(project: WikiProject): Promise<void> {
  await set("lastProject", project)
  await addToRecentProjects(project)
}

export async function addToRecentProjects(project: WikiProject): Promise<void> {
  const existing = (await get<WikiProject[]>("recentProjects")) ?? []
  const filtered = existing.filter((p) => p.path !== project.path)
  const updated = [project, ...filtered].slice(0, 10)
  await set("recentProjects", updated)
}

export async function saveLlmConfig(config: LlmConfig): Promise<void> {
  await set("llmConfig", config)
}

export async function loadLlmConfig(): Promise<LlmConfig | null> {
  return await get<LlmConfig>("llmConfig")
}

export async function saveSearchApiConfig(config: SearchApiConfig): Promise<void> {
  await set("searchApiConfig", config)
}

export async function loadSearchApiConfig(): Promise<SearchApiConfig | null> {
  return await get<SearchApiConfig>("searchApiConfig")
}

export async function saveEmbeddingConfig(config: EmbeddingConfig): Promise<void> {
  await set("embeddingConfig", config)
}

export async function loadEmbeddingConfig(): Promise<EmbeddingConfig | null> {
  return await get<EmbeddingConfig>("embeddingConfig")
}

export async function removeFromRecentProjects(path: string): Promise<void> {
  const existing = (await get<WikiProject[]>("recentProjects")) ?? []
  const updated = existing.filter((p) => p.path !== path)
  await set("recentProjects", updated)
}

export async function saveLanguage(lang: string): Promise<void> {
  await set("language", lang)
}

export async function loadLanguage(): Promise<string | null> {
  return await get<string>("language")
}
