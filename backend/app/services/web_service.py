import requests
from bs4 import BeautifulSoup
from typing import Dict, Any

def extract_web_content(url: str) -> Dict[str, Any]:
    """Scrape and clean article text from a URL."""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    try:
        resp = requests.get(url, headers=headers, timeout=12)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'html.parser')

        # Remove scripts and styling
        for script_or_style in soup(['script', 'style', 'nav', 'footer', 'aside', 'header']):
            script_or_style.decompose()

        title = soup.title.string.strip() if soup.title and soup.title.string else url

        # Find main article content if possible
        article = soup.find('article') or soup.find('main') or soup.find('body')
        if article:
            text = article.get_text(separator='\n')
        else:
            text = soup.get_text(separator='\n')

        # Clean multiple newlines
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        cleaned_content = "\n".join(lines)

        return {
            'title': title,
            'content': cleaned_content[:30000], # safe upper bound
            'success': True
        }
    except Exception as e:
        return {
            'title': url,
            'content': f"Web sayfası içeriği alınamadı: {str(e)}",
            'success': False
        }
