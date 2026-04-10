import { LayoutDashboard, Activity, Search, FileText, Settings, Sun, Moon } from 'lucide-react'
import type { AppView } from '@/types'
import { cn } from '@/lib/utils'

interface HeaderProps {
  currentView: AppView
  onViewChange: (view: AppView) => void
  theme: string
  onToggleTheme: () => void
  tradingMode: string
  mcpConnected: boolean
  mcpToolsCount: number
  onOpenCmdK: () => void
}

const NAV_ITEMS: { id: AppView; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'signals', label: 'Signals', icon: Activity },
  { id: 'research', label: 'Research', icon: Search },
  { id: 'reports', label: 'Reports', icon: FileText },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export default function Header({
  currentView, onViewChange, theme, onToggleTheme,
  tradingMode, mcpConnected, mcpToolsCount, onOpenCmdK,
}: HeaderProps) {
  return (
    <header className="flex items-center h-[52px] px-5 bg-surface border-b border-border gap-6 shrink-0 z-20">
      {/* Brand */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-purple flex items-center justify-center text-white font-extrabold text-sm">
          AP
        </div>
        <span className="text-[15px] font-bold tracking-wide">
          ALPHA <span className="text-accent">PULSE</span>
        </span>
      </div>

      {/* Nav Tabs */}
      <nav className="flex h-full items-stretch gap-0.5">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onViewChange(id)}
            className={cn(
              'flex items-center gap-1.5 px-3.5 text-[13px] font-medium border-b-2 transition-colors',
              currentView === id
                ? 'text-primary border-primary font-semibold'
                : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted'
            )}
          >
            <Icon size={16} className={cn('opacity-70', currentView === id && 'opacity-100')} />
            {label}
          </button>
        ))}
      </nav>

      {/* Right section */}
      <div className="ml-auto flex items-center gap-3">
        <button
          onClick={onOpenCmdK}
          className="flex items-center gap-2 px-3 py-1.5 bg-muted border border-border rounded-md text-xs text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
        >
          <span>Chat & Commands...</span>
          <kbd className="text-[11px] bg-surface border border-border rounded px-1.5 py-0.5 font-medium">⌘K</kbd>
        </button>

        <div className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide',
          tradingMode === 'real'
            ? 'bg-error-light text-error'
            : 'bg-warning-light text-amber-700'
        )}>
          <span className={cn('w-1.5 h-1.5 rounded-full', tradingMode === 'real' ? 'bg-error' : 'bg-warning')} />
          {tradingMode === 'real' ? 'REAL' : 'DEMO'}
        </div>

        <div className={cn(
          'flex items-center gap-1.5 text-xs font-medium',
          mcpConnected ? 'text-success' : 'text-error'
        )}>
          <span className={cn(
            'w-[7px] h-[7px] rounded-full',
            mcpConnected ? 'bg-success shadow-[0_0_6px_rgba(22,163,74,0.4)]' : 'bg-error'
          )} />
          {mcpConnected ? `MCP (${mcpToolsCount})` : 'Disconnected'}
        </div>

        <button
          onClick={onToggleTheme}
          className="w-8 h-8 flex items-center justify-center border border-border rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  )
}
