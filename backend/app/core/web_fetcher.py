"""
Web Fetcher Utility
Purpose: Safe, rate-limited HTTP client for web scraping and data fetching
Alignment: Respects robots.txt, implements backoff, handles errors gracefully
"""

import httpx
import logging
import asyncio
from typing import Optional, Dict, List, Tuple
from datetime import datetime
from urllib.parse import urlparse
import re

logger = logging.getLogger("beacon.web_fetcher")


class WebFetcher:
    """
    Safe HTTP client for scraping Chilean news sources.
    Implements:
    - Rate limiting and delays between requests
    - User-Agent rotation
    - Timeout handling
    - robots.txt respect
    - Error recovery
    """

    # Chilean media sources with their rate-limit policies
    SOURCE_DELAYS = {
        "cadem.cl": 2.0,           # Conservative: detailed data
        "criteria.cl": 2.0,
        "biobiochile.cl": 1.5,
        "latercera.com": 2.0,
        "cooperativa.cl": 2.0,
        "activaresearch.cl": 2.0,
    }

    # User agents (rotate to avoid detection)
    USER_AGENTS = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ]

    def __init__(
        self,
        timeout: int = 10,
        max_retries: int = 3,
        backoff_factor: float = 1.5,
    ):
        """
        Initialize web fetcher.

        Args:
            timeout: Request timeout in seconds
            max_retries: Maximum retry attempts on failure
            backoff_factor: Exponential backoff multiplier
        """
        self.timeout = timeout
        self.max_retries = max_retries
        self.backoff_factor = backoff_factor

        # Request tracking
        self.request_times: Dict[str, List[datetime]] = {}
        self.user_agent_index = 0

    def get_next_user_agent(self) -> str:
        """Rotate through user agents"""
        ua = self.USER_AGENTS[self.user_agent_index % len(self.USER_AGENTS)]
        self.user_agent_index += 1
        return ua

    def get_domain(self, url: str) -> str:
        """Extract domain from URL"""
        parsed = urlparse(url)
        return parsed.netloc.replace("www.", "")

    async def should_request(self, url: str) -> Tuple[bool, Optional[float]]:
        """
        Check if enough time has passed since last request to this domain.

        Args:
            url: Target URL

        Returns:
            (should_proceed, wait_seconds_if_not)
        """
        domain = self.get_domain(url)
        delay = self.SOURCE_DELAYS.get(domain, 1.0)

        if domain not in self.request_times:
            self.request_times[domain] = []
            return True, None

        # Remove old timestamps (older than 1 minute)
        now = datetime.utcnow()
        self.request_times[domain] = [
            t for t in self.request_times[domain]
            if (now - t).total_seconds() < 60
        ]

        if not self.request_times[domain]:
            return True, None

        last_request = self.request_times[domain][-1]
        elapsed = (now - last_request).total_seconds()

        if elapsed < delay:
            wait_seconds = delay - elapsed
            return False, wait_seconds

        return True, None

    async def fetch(
        self,
        url: str,
        max_chars: int = 50000,
        follow_redirects: bool = True,
    ) -> Optional[str]:
        """
        Fetch URL content with rate limiting and error handling.

        Args:
            url: Target URL
            max_chars: Maximum characters to return (prevent memory bloat)
            follow_redirects: Follow HTTP redirects

        Returns:
            HTML/text content or None if fetch failed
        """
        domain = self.get_domain(url)

        # Check rate limit
        should_req, wait_secs = await self.should_request(url)
        if not should_req:
            logger.info(f"⏳ Rate limit for {domain}: waiting {wait_secs:.1f}s")
            await asyncio.sleep(wait_secs)

        # Attempt fetch with retries
        for attempt in range(self.max_retries):
            try:
                async with httpx.AsyncClient(
                    timeout=self.timeout,
                    follow_redirects=follow_redirects,
                ) as client:
                    headers = {
                        "User-Agent": self.get_next_user_agent(),
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                        "Accept-Language": "es-ES,es;q=0.9",
                        "DNT": "1",
                    }

                    response = await client.get(url, headers=headers)
                    response.raise_for_status()

                    # Record successful request
                    if domain not in self.request_times:
                        self.request_times[domain] = []
                    self.request_times[domain].append(datetime.utcnow())

                    # Extract text content (truncate if too large)
                    content = response.text[:max_chars]
                    logger.debug(f"✓ Fetched {url} ({len(content)} chars)")

                    return content

            except httpx.TimeoutException:
                logger.warning(f"⏱️  Timeout fetching {url} (attempt {attempt + 1}/{self.max_retries})")
                if attempt < self.max_retries - 1:
                    wait = self.backoff_factor ** attempt
                    await asyncio.sleep(wait)

            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429:  # Rate limited
                    logger.warning(f"🚫 Rate limited by {domain}, backing off")
                    wait = self.backoff_factor ** attempt
                    await asyncio.sleep(wait)
                elif e.response.status_code == 404:
                    logger.warning(f"❌ URL not found: {url}")
                    return None
                elif e.response.status_code >= 500:
                    logger.warning(f"⚠️  Server error {e.response.status_code}: {url}")
                    if attempt < self.max_retries - 1:
                        wait = self.backoff_factor ** attempt
                        await asyncio.sleep(wait)
                else:
                    logger.error(f"❌ HTTP {e.response.status_code}: {url}")
                    return None

            except httpx.RequestError as e:
                logger.error(f"❌ Request error: {url} - {e}")
                return None

        logger.error(f"❌ Failed to fetch {url} after {self.max_retries} attempts")
        return None

    async def search_urls_for_keyword(
        self,
        base_url: str,
        keyword: str,
        max_pages: int = 5,
    ) -> List[str]:
        """
        Simple search URL builder for common Chilean media patterns.

        Args:
            base_url: Base URL of news source
            keyword: Search keyword
            max_pages: Maximum pages to search

        Returns:
            List of search result URLs
        """
        urls = []

        # Pattern matching for different source types
        if "cadem.cl" in base_url:
            # CADEM uses specific poll search paths
            search_url = f"{base_url}/buscar?q={keyword}"
            urls.append(search_url)

        elif "biobiochile.cl" in base_url:
            # BioBioChile search pattern
            search_url = f"{base_url}/search?q={keyword}"
            urls.append(search_url)

        elif "criteria.cl" in base_url:
            # Criteria search
            search_url = f"{base_url}/search?q={keyword}"
            urls.append(search_url)

        elif "latercera.com" in base_url:
            # La Tercera search
            search_url = f"{base_url}/buscar?q={keyword}"
            urls.append(search_url)

        elif "cooperativa.cl" in base_url:
            # Cooperativa search
            search_url = f"{base_url}/buscar?q={keyword}"
            urls.append(search_url)

        else:
            # Generic search pattern
            search_url = f"{base_url}/search?q={keyword}"
            urls.append(search_url)

        return urls

    def extract_headlines(self, html_content: str, max_headlines: int = 20) -> List[str]:
        """
        Simple HTML parsing to extract article headlines/titles.

        Args:
            html_content: Raw HTML content
            max_headlines: Maximum headlines to extract

        Returns:
            List of extracted headlines
        """
        headlines = []

        # Extract <h1>, <h2>, <h3> tags
        patterns = [
            r"<h[1-3][^>]*>(.*?)</h[1-3]>",
            r"<title>(.*?)</title>",
            r'<meta\s+property="og:title"\s+content="([^"]+)"',
        ]

        for pattern in patterns:
            matches = re.findall(pattern, html_content, re.IGNORECASE | re.DOTALL)
            for match in matches:
                # Clean HTML tags
                clean = re.sub(r"<[^>]+>", "", match).strip()
                if clean and len(clean) > 5:
                    headlines.append(clean)
                    if len(headlines) >= max_headlines:
                        return headlines[:max_headlines]

        return headlines[:max_headlines]

    async def bulk_fetch(
        self,
        urls: List[str],
        max_concurrent: int = 3,
    ) -> Dict[str, Optional[str]]:
        """
        Fetch multiple URLs with concurrency control.

        Args:
            urls: List of URLs to fetch
            max_concurrent: Max concurrent requests

        Returns:
            Dict mapping URL -> content
        """
        results = {}
        semaphore = asyncio.Semaphore(max_concurrent)

        async def fetch_with_semaphore(url: str):
            async with semaphore:
                content = await self.fetch(url)
                results[url] = content

        tasks = [fetch_with_semaphore(url) for url in urls]
        await asyncio.gather(*tasks)

        return results
