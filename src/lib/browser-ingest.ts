// Browser-compatible document processing and embedding generation
// Uses pdf.js for PDF text extraction and Ollama for embeddings

import * as pdfjsLib from "pdfjs-dist"
import { readFile, writeFile, createDirectory } from "./browser-fs"
import { normalizePath } from "./path-utils"

// Set the PDF.js worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

export interface ProcessedDocument {
  path: string
  content: string
  metadata: {
    title?: string
    author?: string
    pageCount?: number
    wordCount: number
  }
  chunks: TextChunk[]
}

export interface TextChunk {
  text: string
  embedding?: number[]
  startIndex: number
  endIndex: number
}

/**
 * Extract text from PDF using pdf.js
 */
export async function extractPdfText(filePath: string): Promise<{ text: string; metadata: { pageCount: number; title?: string } }> {
  const content = await readFile(filePath)
  
  // Convert string content to Uint8Array if needed
  let data: Uint8Array
  if (typeof content === "string") {
    // If stored as base64 or binary string, we need to handle it
    // For now, assume the file was stored as binary data
    data = new Uint8Array(content.length)
    for (let i = 0; i < content.length; i++) {
      data[i] = content.charCodeAt(i) & 0xff
    }
  } else {
    data = content as unknown as Uint8Array
  }
  
  const pdf = await pdfjsLib.getDocument({ data }).promise
  const pageCount = pdf.numPages
  
  let fullText = ""
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .map((item: unknown) => (item as { str: string }).str)
      .join(" ")
    fullText += `\n\n--- Page ${i} ---\n\n${pageText}`
  }
  
  // Try to extract title from first page or metadata
  let title: string | undefined
  try {
    const metadata = await pdf.getMetadata()
    const info = metadata.info as Record<string, unknown> | undefined
    title = typeof info?.Title === "string" ? info.Title : undefined
  } catch {
    // No metadata available
  }
  
  return {
    text: fullText.trim(),
    metadata: { pageCount, title }
  }
}

/**
 * Extract text from various file types
 */
export async function extractText(filePath: string): Promise<{ text: string; metadata: { wordCount: number; title?: string; pageCount?: number } }> {
  const ext = filePath.split(".").pop()?.toLowerCase() || ""
  
  if (ext === "pdf") {
    const result = await extractPdfText(filePath)
    const wordCount = result.text.split(/\s+/).length
    return {
      text: result.text,
      metadata: {
        wordCount,
        title: result.metadata.title,
        pageCount: result.metadata.pageCount
      }
    }
  }
  
  // For text-based files, just read them
  const content = await readFile(filePath)
  const text = typeof content === "string" ? content : ""
  const wordCount = text.split(/\s+/).length
  
  return {
    text,
    metadata: { wordCount }
  }
}

/**
 * Split text into chunks for embedding
 */
export function chunkText(text: string, maxChunkSize: number = 1000, overlap: number = 100): TextChunk[] {
  const chunks: TextChunk[] = []
  const sentences = text.split(/(?<=[.!?])\s+/)
  
  let currentChunk = ""
  let startIndex = 0
  
  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        startIndex,
        endIndex: startIndex + currentChunk.length
      })
      // Keep overlap for context
      const words = currentChunk.split(/\s+/)
      const overlapWords = words.slice(-Math.ceil(overlap / 5)) // Approximate word count
      currentChunk = overlapWords.join(" ") + " " + sentence
      startIndex = chunks[chunks.length - 1].endIndex - currentChunk.length + sentence.length
    } else {
      currentChunk += " " + sentence
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push({
      text: currentChunk.trim(),
      startIndex,
      endIndex: startIndex + currentChunk.length
    })
  }
  
  return chunks
}

/**
 * Generate embeddings using Ollama
 */
export async function generateEmbedding(text: string, ollamaUrl: string = "http://localhost:11434", model: string = "nomic-embed-text"): Promise<number[]> {
  try {
    const response = await fetch(`${ollamaUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: text.slice(0, 8000) // Limit input size
      })
    })
    
    if (!response.ok) {
      throw new Error(`Ollama embedding error: ${response.status}`)
    }
    
    const data = await response.json()
    return data.embedding
  } catch (error) {
    console.error("Failed to generate embedding:", error)
    throw error
  }
}

/**
 * Process a document: extract text, chunk it, generate embeddings
 */
export async function processDocument(
  filePath: string,
  ollamaUrl: string = "http://localhost:11434",
  embeddingModel: string = "nomic-embed-text"
): Promise<ProcessedDocument> {
  // Extract text
  const { text, metadata } = await extractText(filePath)
  
  // Chunk the text
  const chunks = chunkText(text)
  
  // Generate embeddings for each chunk
  const chunksWithEmbeddings: TextChunk[] = []
  for (const chunk of chunks) {
    try {
      const embedding = await generateEmbedding(chunk.text, ollamaUrl, embeddingModel)
      chunksWithEmbeddings.push({ ...chunk, embedding })
    } catch (err) {
      console.error(`Failed to generate embedding for chunk in ${filePath}:`, err)
      chunksWithEmbeddings.push(chunk) // Add without embedding
    }
  }
  
  return {
    path: filePath,
    content: text,
    metadata,
    chunks: chunksWithEmbeddings
  }
}

/**
 * Save processed document to IndexedDB storage
 */
export async function saveProcessedDocument(projectPath: string, doc: ProcessedDocument): Promise<void> {
  const processedDir = `${normalizePath(projectPath)}/.processed`
  await createDirectory(processedDir)
  
  const outputPath = `${processedDir}/${doc.path.split("/").pop()}.json`
  await writeFile(outputPath, JSON.stringify(doc, null, 2))
}

/**
 * Search through processed documents using embeddings
 */
export async function searchDocuments(
  query: string,
  projectPath: string,
  ollamaUrl: string = "http://localhost:11434",
  topK: number = 5
): Promise<Array<{ path: string; chunk: TextChunk; score: number }>> {
  // Generate query embedding
  const queryEmbedding = await generateEmbedding(query, ollamaUrl)
  
  // TODO: Load all processed documents and compare embeddings
  // For now, return empty (needs vector search implementation)
  
  return []
}

// Cosine similarity for comparing embeddings
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}
