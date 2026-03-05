"""Browser Tool — Playwright-based web scraping (sync in thread for Windows)"""
import concurrent.futures
from typing import Dict, Any


class BrowserTool:
    async def call(self, params: Dict, context: Dict = None) -> Dict:
        """Scrape a webpage using Playwright"""
        url = params.get("url", "")
        selectors = params.get("selectors", {})
        
        if not url:
            return {"error": "No URL provided"}

        try:
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(self._scrape_sync, url, selectors)
                return future.result(timeout=30)
        except Exception as e:
            return {"error": f"Browser error: {str(e)}"}

    def _scrape_sync(self, url: str, selectors: Dict) -> Dict:
        """Run Playwright sync API in thread"""
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            return {"error": "Playwright not installed"}

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            ctx = browser.new_context(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            page = ctx.new_page()

            try:
                page.goto(url, timeout=15000)
                page.wait_for_load_state("domcontentloaded")

                if selectors:
                    # Custom selectors mode
                    result = {}
                    for key, selector in selectors.items():
                        try:
                            el = page.query_selector(selector)
                            result[key] = el.inner_text().strip() if el else ""
                        except:
                            result[key] = ""
                    browser.close()
                    return result
                else:
                    # Generic scrape mode
                    title = page.title()
                    text = page.inner_text("body")[:2000]
                    browser.close()
                    return {"title": title, "text": text, "url": url}
            except Exception as e:
                browser.close()
                return {"error": f"Scrape failed: {str(e)[:100]}"}

    async def scrape_github(self, username: str) -> Dict:
        """Scrape GitHub profile page"""
        js_code = """() => {
            const name = document.querySelector('.p-name, [itemprop="name"]')?.innerText?.trim() || '';
            const bio = document.querySelector('.p-note .user-profile-bio, [data-bio-text]')?.innerText?.trim() || '';
            const avatar = document.querySelector('.avatar-user')?.src || '';
            const followers = document.querySelector('a[href*="followers"] .text-bold')?.innerText?.trim() || '0';
            const repos = document.querySelector('a[data-tab="repositories"] .Counter')?.innerText?.trim() || '0';
            const pinned = [];
            document.querySelectorAll('.pinned-item-list-item-content').forEach(el => {
                const n = el.querySelector('.repo')?.innerText?.trim() || '';
                const d = el.querySelector('.pinned-item-desc')?.innerText?.trim() || '';
                const l = el.querySelector('[itemprop="programmingLanguage"]')?.innerText?.trim() || '';
                if (n) pinned.push({name: n, description: d, language: l});
            });
            return {name, bio, avatar, followers, repos, pinned};
        }"""
        
        try:
            def _scrape():
                from playwright.sync_api import sync_playwright
                with sync_playwright() as p:
                    browser = p.chromium.launch(headless=True)
                    ctx = browser.new_context(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
                    page = ctx.new_page()
                    page.goto(f"https://github.com/{username}", timeout=15000)
                    page.wait_for_load_state("domcontentloaded")
                    data = page.evaluate(js_code)
                    browser.close()
                    return data
            
            with concurrent.futures.ThreadPoolExecutor() as executor:
                return executor.submit(_scrape).result(timeout=30)
        except Exception as e:
            return {"error": str(e)}


browser_tool = BrowserTool()
