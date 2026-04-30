interface Field {
  label: string;
  value: string | number | boolean | null | undefined;
}

type DetailFieldsProps = {
  fields: Field[];
  bare?: boolean;
  fixedThreeColumns?: boolean;
};

export default function DetailFields({ fields, bare, fixedThreeColumns }: DetailFieldsProps) {
  const gridClass = fixedThreeColumns
    ? 'grid-cols-3'
    : 'grid-cols-[repeat(auto-fill,minmax(240px,1fr))]';

  return (
    <div className={bare
      ? `grid ${gridClass} gap-4`
      : `mb-6 grid ${gridClass} gap-4 rounded-lg border border-zinc-200 bg-white p-5`
    }>
      {fields.map((f) => (
        <div key={f.label} className="space-y-1">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">{f.label}</div>
          <div className="text-sm text-zinc-700">
            {f.value === null || f.value === undefined || f.value === ''
              ? '—'
              : String(f.value)}
          </div>
        </div>
      ))}
    </div>
  );
}
