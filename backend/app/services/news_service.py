"""뉴스/매크로 데이터 수집 서비스"""
import re
import json
import logging
import httpx
import anthropic
from app.config import settings
from app.models.db import execute_query, execute_insert

logger = logging.getLogger(__name__)


async def fetch_stock_news(stock_name: str, stock_code: str, max_items: int = 5) -> dict:
    """종목 관련 뉴스 수집 + Claude 요약"""
    # 1. 캐시 확인 (당일)
    cached = await execute_query(
        "SELECT title, summary, sentiment FROM news_cache WHERE stock_code = ? AND cached_at >= date('now') LIMIT ?",
        (stock_code, max_items)
    )
    if cached and len(cached) >= 3:
        headlines = [r["title"] for r in cached]
        sentiments = [r["sentiment"] for r in cached if r.get("sentiment")]
        return {
            "headlines": headlines,
            "sentiment": _aggregate_sentiment(sentiments),
            "source": "cache",
        }

    # 2. NAVER 뉴스 검색
    titles = []
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://search.naver.com/search.naver",
                params={"where": "news", "query": f"{stock_name} 주가", "sort": "1"},
                headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"},
                timeout=10,
            )
            titles = re.findall(r'class="news_tit"[^>]*title="([^"]+)"', resp.text)[:max_items]
    except Exception as e:
        logger.warning(f"News fetch failed for {stock_name}: {e}")

    if not titles:
        return {"headlines": [], "sentiment": "neutral", "source": "empty"}

    # 3. Claude로 뉴스 감성 분석
    sentiment = "neutral"
    summary = ""
    try:
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        resp = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=256,
            messages=[{"role": "user", "content": f"""다음 {stock_name}({stock_code}) 관련 뉴스 헤드라인의 종합 감성을 분석해주세요.

헤드라인:
{chr(10).join(f'- {t}' for t in titles)}

JSON으로만 응답 (다른 텍스트 없이):
{{"sentiment": "positive|negative|neutral", "summary": "한 줄 요약"}}"""}],
        )
        text = resp.content[0].text.strip()
        # Extract JSON from possible markdown wrapping
        if "```" in text:
            text = re.sub(r'```(?:json)?\s*', '', text).strip().rstrip('`')
        result = json.loads(text)
        sentiment = result.get("sentiment", "neutral")
        summary = result.get("summary", "")
    except Exception as e:
        logger.warning(f"News sentiment analysis failed: {e}")

    # 4. 캐시 저장
    for title in titles:
        try:
            await execute_insert(
                "INSERT INTO news_cache (stock_code, title, summary, sentiment) VALUES (?, ?, ?, ?)",
                (stock_code, title, summary, sentiment)
            )
        except Exception:
            pass

    return {"headlines": titles, "sentiment": sentiment, "summary": summary, "source": "naver"}


def _aggregate_sentiment(sentiments: list[str]) -> str:
    if not sentiments:
        return "neutral"
    pos = sentiments.count("positive")
    neg = sentiments.count("negative")
    if pos > neg:
        return "positive"
    elif neg > pos:
        return "negative"
    return "neutral"
