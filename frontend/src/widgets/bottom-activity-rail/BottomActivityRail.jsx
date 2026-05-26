import React from 'react'
import { motion } from 'framer-motion'
import { useEventStore } from '@/shared/stores/eventStore'

const STATUS_COLORS = {
  ready:  'var(--color-success, #22C55E)',
  idle:   'var(--color-success, #22C55E)',
  active: 'var(--accent-primary, #60A5FA)',
  error:  'var(--color-error, #F87171)',
}

function StatusDot({ status }) {
  const color = STATUS_COLORS[status] ?? STATUS_COLORS.idle
  return (
    <span
      className="bottom-rail__status-dot"
      style={{ background: color }}
      aria-hidden="true"
    />
  )
}

export default function BottomActivityRail() {
  const latestMessage = useEventStore((s) => s.latestMessage)
  const ingestionStatus = useEventStore((s) => s.ingestionStatus)

  const label = latestMessage || 'Ready'

  return (
    <motion.footer
      className="bottom-activity-rail"
      aria-label="Activity status"
      initial={false}
    >
      <div className="bottom-rail__ticker">
        <StatusDot status={ingestionStatus} />
        <span className="bottom-rail__status-text">{label}</span>
      </div>
    </motion.footer>
  )
}
