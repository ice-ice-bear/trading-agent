import { useState, useCallback, useEffect } from 'react'
import type { AppView } from '@/types'
import { useTheme } from '@/hooks/use-theme'
import { useSettings } from '@/hooks/use-settings'
import { useWebSocket } from '@/hooks/use-websocket'
import { checkHealth } from '@/services/api'
import Header from '@/components/layout/header'
import MainLayout from '@/components/layout/main-layout'
import DashboardView from '@/components/dashboard/dashboard-view'
import SignalsView from '@/components/signals/signals-view'
import ResearchView from '@/components/research/research-view'
import ReportsView from '@/components/reports/reports-view'
import SettingsView from '@/components/settings/settings-view'
import ActivityPanel from '@/components/agent-activity/activity-panel'
import CommandPalette from '@/components/layout/command-palette'

export default function App() {
  const { theme, toggleTheme } = useTheme()
  const { settings } = useSettings()
  const { connected: wsConnected, events } = useWebSocket()
  const [currentView, setCurrentView] = useState<AppView>('dashboard')
  const [mcpConnected, setMcpConnected] = useState(false)
  const [mcpToolsCount, setMcpToolsCount] = useState(0)
  const [cmdkOpen, setCmdkOpen] = useState(false)

  useEffect(() => {
    checkHealth().then((h) => {
      setMcpConnected(h.mcp_connected)
      setMcpToolsCount(h.mcp_tools_count)
    }).catch(() => {})
    const interval = setInterval(() => {
      checkHealth().then((h) => {
        setMcpConnected(h.mcp_connected)
        setMcpToolsCount(h.mcp_tools_count)
      }).catch(() => {})
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdkOpen(prev => !prev)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const renderView = useCallback(() => {
    switch (currentView) {
      case 'dashboard': return <DashboardView />
      case 'signals': return <SignalsView />
      case 'research': return <ResearchView />
      case 'reports': return <ReportsView />
      case 'settings': return <SettingsView />
      default: return <DashboardView />
    }
  }, [currentView])

  return (
    <div className="h-screen overflow-hidden">
      <Header
        currentView={currentView}
        onViewChange={setCurrentView}
        theme={theme}
        onToggleTheme={toggleTheme}
        tradingMode={settings.trading_mode}
        mcpConnected={mcpConnected}
        mcpToolsCount={mcpToolsCount}
        onOpenCmdK={() => setCmdkOpen(true)}
      />
      <MainLayout
        rightPanel={<ActivityPanel events={events} wsConnected={wsConnected} />}
      >
        {renderView()}
      </MainLayout>
      <CommandPalette open={cmdkOpen} onClose={() => setCmdkOpen(false)} onNavigate={setCurrentView} />
    </div>
  )
}
