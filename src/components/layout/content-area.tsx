import { useEffect, useCallback, useRef } from "react"
import { useWikiStore } from "@/stores/wiki-store"
import { readFile, writeFile } from "@/commands/fs"
import { WikiEditor } from "@/components/editor/wiki-editor"
import { ChatBar } from "./chat-bar"

export function ContentArea() {
  const selectedFile = useWikiStore((s) => s.selectedFile)
  const fileContent = useWikiStore((s) => s.fileContent)
  const setFileContent = useWikiStore((s) => s.setFileContent)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!selectedFile) {
      setFileContent("")
      return
    }
    readFile(selectedFile)
      .then(setFileContent)
      .catch((err) => setFileContent(`Error loading file: ${err}`))
  }, [selectedFile, setFileContent])

  const handleSave = useCallback(
    (markdown: string) => {
      if (!selectedFile) return
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        writeFile(selectedFile, markdown).catch((err) =>
          console.error("Failed to save:", err),
        )
      }, 1000)
    },
    [selectedFile],
  )

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  const isMarkdown = selectedFile?.endsWith(".md")

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto">
        {selectedFile ? (
          isMarkdown ? (
            <WikiEditor
              key={selectedFile}
              content={fileContent}
              onSave={handleSave}
            />
          ) : (
            <div className="p-6">
              <div className="mb-4 text-xs text-muted-foreground">
                {selectedFile}
              </div>
              <pre className="whitespace-pre-wrap font-mono text-sm">
                {fileContent}
              </pre>
            </div>
          )
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Select a file from the tree to view
          </div>
        )}
      </div>
      <ChatBar />
    </div>
  )
}
