// Ollama API client for local LLM integration
// Uses GPU when available via Ollama's CUDA support

const DEFAULT_OLLAMA_URL = "http://localhost:11434"

export interface OllamaModel {
  name: string
  size: number
  parameter_size?: string
  quantization_level?: string
}

export async function getOllamaModels(baseUrl: string = DEFAULT_OLLAMA_URL): Promise<OllamaModel[]> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    })
    
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`)
    }
    
    const data = await response.json()
    return data.models || []
  } catch (error) {
    console.error("Failed to fetch Ollama models:", error)
    return []
  }
}

export async function testOllamaConnection(baseUrl: string = DEFAULT_OLLAMA_URL): Promise<{ success: boolean; message: string; gpu?: boolean }> {
  try {
    // Test connection by listing models
    const models = await getOllamaModels(baseUrl)
    
    if (models.length === 0) {
      return { success: true, message: "Connected but no models found. Run: ollama pull llama3.2:3b", gpu: false }
    }
    
    // Check if GPU is being used by running a test generation
    const testModel = models[0].name
    const startTime = Date.now()
    
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: testModel,
        prompt: "test",
        stream: false,
        options: { num_predict: 1 }
      }),
    })
    
    if (!response.ok) {
      throw new Error(`Generation test failed: ${response.status}`)
    }
    
    const elapsed = Date.now() - startTime
    
    // Fast response (< 100ms) suggests GPU, slow suggests CPU
    const usingGpu = elapsed < 100
    
    return {
      success: true,
      message: `Connected! ${models.length} model(s) available. ${testModel} responded in ${elapsed}ms (${usingGpu ? "GPU" : "CPU"}).`,
      gpu: usingGpu,
    }
  } catch (error) {
    return {
      success: false,
      message: `Connection failed: ${error instanceof Error ? error.message : "Unknown error"}. Is Ollama running?`,
      gpu: false,
    }
  }
}

export async function generateWithOllama(
  model: string,
  prompt: string,
  baseUrl: string = DEFAULT_OLLAMA_URL,
  onToken?: (token: string) => void
): Promise<string> {
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: onToken ? true : false,
    }),
  })
  
  if (!response.ok) {
    throw new Error(`Ollama generation failed: ${response.status}`)
  }
  
  if (onToken && response.body) {
    // Streaming mode
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let fullResponse = ""
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      const chunk = decoder.decode(value)
      const lines = chunk.split("\n").filter(line => line.trim())
      
      for (const line of lines) {
        try {
          const data = JSON.parse(line)
          if (data.response) {
            fullResponse += data.response
            onToken(data.response)
          }
        } catch {
          // Ignore parse errors for incomplete chunks
        }
      }
    }
    
    return fullResponse
  } else {
    // Non-streaming mode
    const data = await response.json()
    return data.response
  }
}

export function getRecommendedModels(): string[] {
  return [
    "llama3.2:3b",      // Fast, good for most tasks
    "llama3.2:1b",      // Very fast, lower quality
    "qwen2.5:7b",       // Good multilingual support
    "phi3:mini",        // Microsoft, efficient
    "nomic-embed-text", // For embeddings
  ]
}
