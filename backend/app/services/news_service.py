"""뉴스/매크로 데이터 수집 서비스 — NAVER + Google News RSS 폴백"""
import re
import json
import logging
import xml.etree.ElementTree as ET
from html import unescape
import httpx
import anthropic
from app.config import settings
from app.models.db import execute_query, execute_insert

logger = logging.getLogger(__name__)


async def _fetch_naver_news(stock_name: str, max_items: int = 5) -> list[str]:
    """NAVER 뉴스 검색으로 헤드라인 수집"""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://search.naver.com/search.naver",
                params={"where": "news", "query": f"{stock_name} 주가", "sort": "1"},
                headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"},
                timeout=10,
            )
            titles = re.findall(r'class="news_tit"[^>]*title="([^"]+)"', resp.text)[:max_items]
            return titles
    except Exception as e:
        logger.warning(f"NAVER news fetch failed for {stock_name}: {e}")
        return []


async def _fetch_google_news_rss(stock_name: str, max_items: int = 5) -> list[str]:
    """Google News RSS 폴백으로 헤드라인 수집"""
    try:
        query = f"{stock_name} 주식"
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://news.google.com/rss/search",
                params={"q": query, "hl": "ko", "gl": "KR", "ceid": "KR:ko"},
                headers={"User-Agent": "Mozilla/5.0"},
                timeout=10,
            )
            root = ET.fromstring(resp.text)
            titles = []
            for item in root.findall(".//item")[:max_items]:
                title_el = item.find("title")
                if title_el is not None and title_el.text:
                    # Clean up HTML entities and source suffix
                    title = unescape(title_el.text)
                    # Google News adds " - Source" at the end, remove it
                    title = re.sub(r'\s*-\s*[^-]+$', '', title).strip()
                    if title:
                        titles.append(title)
            return titles
    except Exception as e:
        logger.warning(f"Google News RSS fetch failed for {stock_name}: {e}")
        return []


async def fetch_stock_news(stock_name: str, stock_code: str, max_items: int = 5) -> dict:
    """종목 관련 뉴스 수집 + Claude 요약. NAVER 우선, Google News RSS 폴백."""
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

    # 2. NAVER 우선, 실패 시 Google News RSS 폴백
    titles = await _fetch_naver_news(stock_name, max_items)
    source = "naver"
    if not titles:
        titles = await _fetch_google_news_rss(stock_name, max_items)
        source = "google_rss"

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

    return {"headlines": titles, "sentiment": sentiment, "summary": summary, "source": source}


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
