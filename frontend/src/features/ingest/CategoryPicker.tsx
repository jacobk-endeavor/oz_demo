import type { ChangeEvent } from 'react'

interface CategoryPickerProps {
  value: string
  onChange: (value: string) => void
}

export function CategoryPicker({ value, onChange }: CategoryPickerProps) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value)
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="category-input" className="text-sm font-medium text-zinc-700">
        Category
      </label>
      <input
        id="category-input"
        type="text"
        value={value}
        onChange={handleChange}
        placeholder="e.g. hvac, sales, finance"
        className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )
}
