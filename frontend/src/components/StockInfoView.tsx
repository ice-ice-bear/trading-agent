import { useState } from 'react';
import DiscoverySidebar from './stockinfo/DiscoverySidebar';
import ResearchPanel from './stockinfo/ResearchPanel';
import './StockInfoView.css';

export default function StockInfoView() {
  const [selectedStock, setSelectedStock] = useState<{ code: string; name: string } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleSelectStock = (code: string, name: string) => {
    setSelectedStock({ code, name });
  };

  return (
    <div className={`stockinfo-view ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <DiscoverySidebar
        onSelectStock={handleSelectStock}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <ResearchPanel
        stockCode={selectedStock?.code ?? null}
        stockName={selectedStock?.name ?? ''}
      />
    </div>
  );
}
