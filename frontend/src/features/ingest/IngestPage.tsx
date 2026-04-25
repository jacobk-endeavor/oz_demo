import { useState } from 'react'
import { Button } from '../../shared/ui/Button'
import { FileDropzone } from './FileDropzone'
import { CategoryPicker } from './CategoryPicker'

export function IngestPage() {
  const [file, setFile] = useState<File | null>(null)
  const [category, setCategory] = useState('')
  const [showNote, setShowNote] = useState(false)

  // TODO(wave-N): wire Begin Processing to /api/ingest once the endpoint is ready
  function handleBeginProcessing() {
    setShowNote(true)
  }

  return (
    <div className="flex items-start justify-center pt-8">
      <div className="w-full max-w-lg flex flex-col gap-6">
        <h1 className="text-xl font-semibold text-zinc-900">Ingest a document</h1>

        <FileDropzone file={file} onFileChange={setFile} />

        <CategoryPicker value={category} onChange={setCategory} />

        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            onClick={handleBeginProcessing}
            data-testid="ingest-begin-button"
            className="w-full"
          >
            Begin processing
          </Button>

          {showNote && (
            <p
              role="status"
              className="text-sm text-center text-zinc-500 bg-zinc-100 rounded-lg px-4 py-2"
            >
              Ingest via UI is not yet wired — use <code className="font-mono">ecl ingest</code> CLI for now.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
