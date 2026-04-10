import { Command } from 'cmdk'
import { LayoutDashboard, Activity, Search, FileText, Settings, Play, RefreshCw } from 'lucide-react'
import type { AppView } from '@/types'
import { runAgent } from '@/services/api'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  onNavigate: (view: AppView) => void
}

export default function CommandPalette({ open, onClose, onNavigate }: CommandPaletteProps) {
  if (!open) return null

  const navigate = (view: AppView) => { onNavigate(view); onClose() }

  const handleRunAgent = async (agentId: string) => {
    onClose()
    try { await runAgent(agentId) } catch { /* ignore */ }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center pt-[120px] z-[1000]" onClick={onClose}>
      <div className="w-[560px] bg-surface border border-border rounded-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <Command>
          <Command.Input
            placeholder="Search commands, navigate, run agents..."
            className="w-full px-5 py-4 border-b border-border-light bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
            autoFocus
          />
          <Command.List className="max-h-[300px] overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">No results found.</Command.Empty>

            <Command.Group heading="Quick Actions" className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              <Command.Item onSelect={() => handleRunAgent('market_scanner')} className="flex items-center gap-2.5 px-3 py-2.5 rounded-md cursor-pointer text-[13px] text-muted-foreground hover:bg-primary-light hover:text-primary">
                <Play size={16} /> Run Market Scanner
              </Command.Item>
              <Command.Item onSelect={() => handleRunAgent('portfolio_monitor')} className="flex items-center gap-2.5 px-3 py-2.5 rounded-md cursor-pointer text-[13px] text-muted-foreground hover:bg-primary-light hover:text-primary">
                <RefreshCw size={16} /> Refresh Portfolio
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Navigate" className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              <Command.Item onSelect={() => navigate('dashboard')} className="flex items-center gap-2.5 px-3 py-2.5 rounded-md cursor-pointer text-[13px] text-muted-foreground hover:bg-primary-light hover:text-primary">
                <LayoutDashboard size={16} /> Dashboard
              </Command.Item>
              <Command.Item onSelect={() => navigate('signals')} className="flex items-center gap-2.5 px-3 py-2.5 rounded-md cursor-pointer text-[13px] text-muted-foreground hover:bg-primary-light hover:text-primary">
                <Activity size={16} /> Signals
              </Command.Item>
              <Command.Item onSelect={() => navigate('research')} className="flex items-center gap-2.5 px-3 py-2.5 rounded-md cursor-pointer text-[13px] text-muted-foreground hover:bg-primary-light hover:text-primary">
                <Search size={16} /> Research
              </Command.Item>
              <Command.Item onSelect={() => navigate('reports')} className="flex items-center gap-2.5 px-3 py-2.5 rounded-md cursor-pointer text-[13px] text-muted-foreground hover:bg-primary-light hover:text-primary">
                <FileText size={16} /> Reports
              </Command.Item>
              <Command.Item onSelect={() => navigate('settings')} className="flex items-center gap-2.5 px-3 py-2.5 rounded-md cursor-pointer text-[13px] text-muted-foreground hover:bg-primary-light hover:text-primary">
                <Settings size={16} /> Settings
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
