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
            className="w-full px-5 py-4 border-b border-border-light bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
            autoFocus
          />
          <Command.List className="max-h-[320px] overflow-y-auto p-2 [&_[cmdk-group]]:mb-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground">
            <Command.Empty className="py-8 text-center text-[13px] text-muted-foreground">No results found.</Command.Empty>

            <Command.Group heading="Quick Actions">
              <Command.Item onSelect={() => handleRunAgent('market_scanner')} className="flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer text-[13px] text-foreground aria-selected:bg-primary-light aria-selected:text-primary hover:bg-primary-light hover:text-primary">
                <Play size={15} className="shrink-0" /> <span className="leading-none">Run Market Scanner</span>
              </Command.Item>
              <Command.Item onSelect={() => handleRunAgent('portfolio_monitor')} className="flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer text-[13px] text-foreground aria-selected:bg-primary-light aria-selected:text-primary hover:bg-primary-light hover:text-primary">
                <RefreshCw size={15} className="shrink-0" /> <span className="leading-none">Refresh Portfolio</span>
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Navigate">
              <Command.Item onSelect={() => navigate('dashboard')} className="flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer text-[13px] text-foreground aria-selected:bg-primary-light aria-selected:text-primary hover:bg-primary-light hover:text-primary">
                <LayoutDashboard size={15} className="shrink-0" /> <span className="leading-none">Dashboard</span>
              </Command.Item>
              <Command.Item onSelect={() => navigate('signals')} className="flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer text-[13px] text-foreground aria-selected:bg-primary-light aria-selected:text-primary hover:bg-primary-light hover:text-primary">
                <Activity size={15} className="shrink-0" /> <span className="leading-none">Signals</span>
              </Command.Item>
              <Command.Item onSelect={() => navigate('research')} className="flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer text-[13px] text-foreground aria-selected:bg-primary-light aria-selected:text-primary hover:bg-primary-light hover:text-primary">
                <Search size={15} className="shrink-0" /> <span className="leading-none">Research</span>
              </Command.Item>
              <Command.Item onSelect={() => navigate('reports')} className="flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer text-[13px] text-foreground aria-selected:bg-primary-light aria-selected:text-primary hover:bg-primary-light hover:text-primary">
                <FileText size={15} className="shrink-0" /> <span className="leading-none">Reports</span>
              </Command.Item>
              <Command.Item onSelect={() => navigate('settings')} className="flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer text-[13px] text-foreground aria-selected:bg-primary-light aria-selected:text-primary hover:bg-primary-light hover:text-primary">
                <Settings size={15} className="shrink-0" /> <span className="leading-none">Settings</span>
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
