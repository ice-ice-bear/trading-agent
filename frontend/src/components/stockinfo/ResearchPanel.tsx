import { useState, useEffect } from 'react';
import { getStockPrice, getStockAnalysis, getStockNews } from '../../services/api';
import type { StockPrice, StockAnalysis, StockNews } from '../../types';
import ResearchHeader from './ResearchHeader';
import PriceChartSection from './PriceChartSection';
import FundamentalsSection from './FundamentalsSection';
import InvestorFlowSection from './InvestorFlowSection';
import NewsDisclosureSection from './NewsDisclosureSection';
import ValuationSection from './ValuationSection';
import PeerSection from './PeerSection';
import InsiderSection from './InsiderSection';
import SignalHistorySection from './SignalHistorySection';

interface ResearchPanelProps {
  stockCode: string | null;
  stockName: string;
}

export default function ResearchPanel({ stockCode, stockName }: ResearchPanelProps) {
  const [price, setPrice] = useState<StockPrice | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);

  const [analysis, setAnalysis] = useState<StockAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const [news, setNews] = useState<StockNews | null>(null);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);

  useEffect(() => {
    if (!stockCode) return;

    // Wrap in microtask to avoid sync setState in effect body
    const load = async () => {
      // Reset all state
      setPrice(null);
      setAnalysis(null);
      setNews(null);
      setAnalysisError(null);
      setNewsError(null);

      // Phase 1: fire all requests in parallel
      setPriceLoading(true);
      setAnalysisLoading(true);
      setNewsLoading(true);

      getStockPrice(stockCode)
        .then(setPrice)
        .catch(() => {})
        .finally(() => setPriceLoading(false));

      getStockAnalysis(stockCode)
        .then(setAnalysis)
        .catch(() => setAnalysisError('분석 데이터를 불러올 수 없습니다'))
        .finally(() => setAnalysisLoading(false));

      getStockNews(stockCode, stockName)
        .then(setNews)
        .catch(() => setNewsError('뉴스를 불러올 수 없습니다'))
        .finally(() => setNewsLoading(false));
    };
    load();
  }, [stockCode, stockName]);

  if (!stockCode) {
    return (
      <div className="research-panel-empty">
        <div className="empty-icon">📊</div>
        <div className="empty-title">종목을 선택해주세요</div>
        <div className="empty-desc">좌측에서 종목을 검색하거나 랭킹에서 선택하세요</div>
      </div>
    );
  }

  const currentPrice = price ? Number(price.stck_prpr) : 0;

  return (
    <div className="research-panel">
      <ResearchHeader stockCode={stockCode} stockName={stockName} price={price} loading={priceLoading} />

      <div className="research-grid">
        <div className="research-main-col">
          <PriceChartSection
            chart={analysis?.chart ?? null}
            technicals={analysis?.technicals ?? null}
            loading={analysisLoading}
            error={analysisError}
            onRetry={() => { setAnalysisLoading(true); setAnalysisError(null); getStockAnalysis(stockCode).then(setAnalysis).catch(() => setAnalysisError('재시도 실패')).finally(() => setAnalysisLoading(false)); }}
          />
          <NewsDisclosureSection newsData={news} loading={newsLoading} error={newsError} onRetry={() => { setNewsLoading(true); setNewsError(null); getStockNews(stockCode, stockName).then(setNews).catch(() => setNewsError('재시도 실패')).finally(() => setNewsLoading(false)); }} />
        </div>

        <div className="research-side-col">
          <FundamentalsSection
            fundamentals={analysis?.fundamentals ?? null}
            confidenceGrades={analysis?.confidence_grades ?? {}}
            loading={analysisLoading}
            error={analysisError}
          />
          <ValuationSection dcf={analysis?.dcf ?? null} currentPrice={currentPrice} loading={analysisLoading} error={analysisError} />
          <InvestorFlowSection investorTrend={analysis?.investor_trend ?? null} loading={analysisLoading} error={analysisError} />
        </div>
      </div>

      <div className="research-bottom-row">
        <PeerSection stockCode={stockCode} />
        <InsiderSection insiderTrades={analysis?.insider_trades ?? null} loading={analysisLoading} error={analysisError} />
        <SignalHistorySection stockCode={stockCode} />
      </div>
    </div>
  );
}
