import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '../store/useStore'

const icons = {
  success: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22d3a1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  error: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  ),
  'friend:joined': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4361f8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <polyline points="16 11 18 13 22 9"/>
    </svg>
  ),
  'friend:left': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <line x1="17" y1="11" x2="22" y2="11"/>
    </svg>
  ),
}

const colorMap = {
  success:        'border-accent-green/30 bg-accent-green/10',
  error:          'border-accent-red/30 bg-accent-red/10',
  'friend:joined':'border-brand-600/30 bg-brand-600/10',
  'friend:left':  'border-accent-orange/30 bg-accent-orange/10',
}

export default function NotificationStack() {
  const notifications = useStore((s) => s.notifications)

  return (
    <div className="fixed bottom-6 right-4 z-50 flex flex-col gap-2 items-end pointer-events-none">
      <AnimatePresence>
        {notifications.map((n) => (
          <motion.div
            key={n.id}
            initial={{ x: 120, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 120, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl border backdrop-blur-xl text-sm font-medium text-white max-w-xs shadow-2xl shadow-black/60
              ${colorMap[n.type] || 'border-white/[0.15] bg-white/[0.08]'}`}
          >
            {icons[n.type] || icons.success}
            <span className="text-white/90">{n.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
