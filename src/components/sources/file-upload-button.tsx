import { useRef, useState } from "react"
import { Upload, FolderUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { uploadFiles, uploadFolder, supportsFileSystemAccess, readFilesFromInput } from "@/lib/browser-upload"

interface FileUploadButtonProps {
  projectPath: string
  onUpload: (paths: string[]) => void
  disabled?: boolean
}

export function FileUploadButton({ projectPath, onUpload, disabled }: FileUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  
  // Check if we're in browser mode (no Tauri)
  const isBrowser = typeof window !== "undefined" && 
    !(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  
  // Traditional file input for text files
  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    
    setUploading(true)
    try {
      const paths = await readFilesFromInput(files, projectPath)
      onUpload(paths)
    } catch (err) {
      console.error("Upload failed:", err)
    } finally {
      setUploading(false)
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }
  
  // File System Access API for files
  const handleFilePicker = async () => {
    if (!supportsFileSystemAccess()) {
      // Fall back to traditional file input
      fileInputRef.current?.click()
      return
    }
    
    setUploading(true)
    try {
      const paths = await uploadFiles(projectPath, { multiple: true })
      onUpload(paths)
    } catch (err) {
      console.error("File picker failed:", err)
      // Fall back to traditional input
      fileInputRef.current?.click()
    } finally {
      setUploading(false)
    }
  }
  
  // File System Access API for folders
  const handleFolderPicker = async () => {
    if (!supportsFileSystemAccess()) {
      alert("Folder upload requires Chrome/Edge with File System Access API support.")
      return
    }
    
    setUploading(true)
    try {
      const paths = await uploadFolder(projectPath)
      onUpload(paths)
    } catch (err) {
      console.error("Folder upload failed:", err)
      alert("Folder upload failed. Please try individual files or use Chrome/Edge.")
    } finally {
      setUploading(false)
    }
  }
  
  // Don't show in desktop mode (Tauri handles this natively)
  if (!isBrowser) return null
  
  return (
    <>
      {/* Hidden file input for fallback */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".md,.txt,.pdf,.docx,.json,.csv,.html,.xml,.yaml,.yml"
        onChange={handleFileInput}
        className="hidden"
      />
      
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleFilePicker}
          disabled={disabled || uploading}
        >
          <Upload className="mr-2 h-4 w-4" />
          {uploading ? "Uploading..." : "Upload Files"}
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          onClick={handleFolderPicker}
          disabled={disabled || uploading}
        >
          <FolderUp className="mr-2 h-4 w-4" />
          Upload Folder
        </Button>
      </div>
      
      {!supportsFileSystemAccess() && (
        <p className="text-xs text-muted-foreground mt-1">
          For best results, use Chrome or Edge with File System Access API support.
        </p>
      )}
    </>
  )
}
