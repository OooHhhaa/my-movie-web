import json
import re
from pathlib import Path
from typing import Dict, List
from urllib.parse import urljoin
from urllib.request import Request, urlopen


HOME_URL = "https://www.iyf.tv/"
OUTPUT_FILE = Path("data.json")


def fetch_home_html(url: str) -> str:
    req = Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            )
        },
    )
    with urlopen(req, timeout=20) as resp:
        return resp.read().decode("utf-8", errors="ignore")


def extract_inject_json(html: str) -> Dict:
    match = re.search(r"var\s+injectJson\s*=\s*(\{.*?\});", html, flags=re.S)
    if not match:
        raise ValueError("未在首页源码中找到 injectJson。")
    return json.loads(match.group(1))


def collect_movie_items(inject_data: Dict) -> List[Dict[str, str]]:
    results: List[Dict[str, str]] = []
    seen = set()

    for key, value in inject_data.items():
        if not isinstance(value, list):
            continue

        for item in value:
            if not isinstance(item, dict):
                continue

            title = str(item.get("title", "")).strip()
            img = str(item.get("img") or item.get("image") or "").strip()
            raw_url = str(item.get("url") or "").strip()
            sub_title = str(item.get("subTitle") or "").strip()

            if not (title and img and raw_url):
                continue

            play_url = urljoin(HOME_URL, raw_url)
            is_play_page = "/play/" in play_url
            is_movie = ("电影" in sub_title) or ("movie" in key.lower())
            if not (is_play_page and is_movie):
                continue

            if play_url in seen:
                continue
            seen.add(play_url)

            results.append(
                {
                    "title": title,
                    "poster": img,
                    "play_url": play_url,
                }
            )

    return results


def save_json(items: List[Dict[str, str]], file_path: Path) -> None:
    file_path.write_text(
        json.dumps(items, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def main() -> None:
    html = fetch_home_html(HOME_URL)
    inject_data = extract_inject_json(html)
    movies = collect_movie_items(inject_data)
    save_json(movies, OUTPUT_FILE)
    print(f"已抓取 {len(movies)} 条电影数据，保存到 {OUTPUT_FILE.resolve()}")


if __name__ == "__main__":
    main()
