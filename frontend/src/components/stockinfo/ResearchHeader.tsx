import { StockPrice } from '../../types';
import { addToWatchlist } from '../../services/api';

interface ResearchHeaderProps {
  stockCode: string;
  stockName: string;
  price: StockPrice | null;
  loading: boolean;
}

export default function ResearchHeader({ stockCode, stockName, price, loading }: ResearchHeaderProps) {
  const currentPrice = price ? Number(price.stck_prpr) : 0;
  const change = price ? Number(price.prdy_vrss) : 0;
  const changePct = price ? Number(price.prdy_ctrt) : 0;
  const isPositive = change > 0;
  const isNegative = change < 0;

  const handleAddWatchlist = () => {
    addToWatchlist(stockCode, stockName).catch(console.error);
  };

  return (
    <div className="research-header">
      <div className="research-header-left">
        <span className="research-stock-name">{stockName || stockCode}</span>
        <span className="research-stock-code">{stockCode}</span>
        {loading ? (
          <span className="text-muted" style={{ marginLeft: 16 }}>로딩 중...</span>
        ) : price ? (
          <>
            <span className="research-price">₩{currentPrice.toLocaleString()}</span>
            <span className={`research-change ${isPositive ? 'positive' : isNegative ? 'negative' : ''}`}>
              {isPositive ? '▲' : isNegative ? '▼' : ''} {Math.abs(change).toLocaleString()} ({changePct > 0 ? '+' : ''}{changePct}%)
            </span>
          </>
        ) : null}
      </div>
      <div className="research-header-right">
        <button className="research-btn" onClick={handleAddWatchlist}>+ 관심종목</button>
      </div>
    </div>
  );
}
