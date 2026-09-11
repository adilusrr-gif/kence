import { useEffect, useState } from 'react'
import {
  FileSearch, Database, Clock, ShieldAlert, FileText,
  GitCompare, FileBarChart2, BookOpen, FileEdit, Landmark, ShieldCheck, Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const ICONS = {
  document_analyst: FileSearch,
  data_extractor: Database,
  timeline: Clock,
  risk_engine: ShieldAlert,
  summary: FileText,
  comparison: GitCompare,
  report_generator: FileBarChart2,
  research: BookOpen,
  document_editor: FileEdit,
  government_briefing: Landmark,
  compliance: ShieldCheck,
}

function chunk(arr, size) {
  const rows = []
  for (let i = 0; i < arr.length; i += size) rows.push(arr.slice(i, i + size))
  return rows
}

// Cards per row scales down on narrower viewports so a row never needs to
// scroll sideways to be seen in full.
function usePerRow() {
  const [perRow, setPerRow] = useState(4)
  useEffect(() => {
    const onResize = () => setPerRow(window.innerWidth < 640 ? 2 : window.innerWidth < 1024 ? 3 : 4)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return perRow
}

// Each agent type renders as its own card in a fanned, overlapping stack
// (display-cards.jsx style) instead of a flat grid — hover/focus/select
// lifts a card out of the stack so it reads as standing apart from the rest.
// Items wrap into multiple stacked rows rather than one wide scrolling row.
export default function AgentTypeStack({ items, selected, onSelect }) {
  const [hovered, setHovered] = useState(null)
  const perRow = usePerRow()
  const rows = chunk(items, perRow)

  return (
    <div className="flex flex-col gap-y-10 pb-2 pt-3" role="radiogroup">
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="flex">
          {row.map(([type, info], index) => {
            const Icon = ICONS[type] || Sparkles
            const isSelected = selected === type
            const isLifted = isSelected || hovered === type

            return (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => onSelect(type)}
                onMouseEnter={() => setHovered(type)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(type)}
                onBlur={() => setHovered(null)}
                style={{ marginLeft: index === 0 ? 0 : '-3.25rem', zIndex: isLifted ? 50 : index }}
                className={cn(
                  'relative flex h-32 w-56 shrink-0 -skew-y-[6deg] flex-col justify-between rounded-xl border-2 bg-[var(--bg-surface-2)] px-4 py-3 text-left',
                  'transition-all duration-300 ease-out grayscale-[60%] outline-none',
                  isLifted
                    ? '-translate-y-6 skew-y-0 grayscale-0 border-[var(--accent-primary)] shadow-xl'
                    : 'border-[var(--border-default)] hover:-translate-y-3'
                )}
              >
                <span className="inline-flex w-fit items-center justify-center rounded-full bg-[var(--bg-surface-3)] p-1.5">
                  <Icon className="size-4 text-[var(--accent-primary)]" />
                </span>
                <span className="text-sm font-semibold text-[var(--text-primary)]">{info.label}</span>
                <span className="line-clamp-2 text-xs text-muted-foreground">{info.description}</span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
