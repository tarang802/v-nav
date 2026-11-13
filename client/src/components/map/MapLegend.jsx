const ITEMS = [
  { label: 'You', dot: 'bg-emerald-500' },
  { label: 'Friends', dot: 'bg-brand-500' },
  { label: 'Events', dot: 'bg-orange-500' },
]

/** What the marker colours mean. Decorative for sighted users; the lists carry the same information as text. */
export default function MapLegend() {
  return (
    <ul aria-label="Map legend" className="flex gap-3 rounded-xl bg-white px-3 py-2 text-xs text-slate-600 shadow-lg ring-1 ring-slate-200">
      {ITEMS.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ring-2 ring-white ${item.dot}`} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  )
}
