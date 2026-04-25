import { useRef, useState, type DragEvent, type ChangeEvent } from 'react'

const ACCEPTED = ['.xlsx', '.csv', '.pdf', '.txt', '.md', '.json', '.png', '.jpg']
const ACCEPT_ATTR = ACCEPTED.join(',')

interface FileDropzoneProps {
  file: File | null
  onFileChange: (file: File | null) => void
}

export function FileDropzone({ file, onFileChange }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) onFileChange(dropped)
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(true)
  }

  function handleDragLeave() {
    setDragOver(false)
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null
    onFileChange(picked)
  }

  return (
    <div
      role="button"
      aria-label="File drop zone"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={[
        'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 cursor-pointer transition-colors',
        dragOver
          ? 'border-blue-400 bg-blue-50'
          : 'border-zinc-300 bg-zinc-50 hover:border-zinc-400',
      ].join(' ')}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="sr-only"
        onChange={handleChange}
        data-testid="file-input"
      />
      {file ? (
        <p className="text-sm text-zinc-700 font-medium">{file.name}</p>
      ) : (
        <>
          <p className="text-sm text-zinc-600">Drag &amp; drop a file here, or click to browse</p>
          <p className="text-xs text-zinc-400">{ACCEPTED.join(', ')}</p>
        </>
      )}
    </div>
  )
}
