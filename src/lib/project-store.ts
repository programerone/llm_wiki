// Settings storage - uses Tauri in desktop app, localStorage in browser
export {
  getRecentProjects,
  getLastProject,
  saveLastProject,
  addToRecentProjects,
  saveLlmConfig,
  loadLlmConfig,
  saveSearchApiConfig,
  loadSearchApiConfig,
  saveEmbeddingConfig,
  loadEmbeddingConfig,
  removeFromRecentProjects,
  saveLanguage,
  loadLanguage,
} from "@/lib/browser-store"
