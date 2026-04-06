/**
 * components/ui/ToastContainer.jsx — Animated toast notifications.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react'
import { useStore } from '../../store'

const ICONS = { success: CheckCircle, error: AlertTriangle, info: Info }
const STYLES = {
  success: 'border-forest-400/40 bg-forest-500/15 text-forest-300',
  error:   'border-red-400/40 bg-red-500/15 text-red-300',
  info:    'border-blue-400/40 bg-blue-500/15 text-blue-300',
}

export default function ToastContainer() {
  const toasts = useStore(s => s.toasts)

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map(({ id, type = 'info', message }) => {
          const Icon = ICONS[type] ?? Info
          return (
            <motion.div key={id}
              initial={{ opacity: 0, x: 60, scale: 0.9 }}
              animate={{ opacity: 1, x: 0,  scale: 1 }}
              exit={{ opacity: 0, x: 60, scale: 0.9 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-md shadow-xl text-sm max-w-xs ${STYLES[type]}`}
            >
              <Icon size={15} className="flex-shrink-0" />
              <p className="flex-1 text-slate-200">{message}</p>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
