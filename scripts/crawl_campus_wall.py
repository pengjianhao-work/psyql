"""云上校友圈公开帖子采集：限速翻页、基础脱敏、SQLite 去重入库。

仅采集当前账号可见内容。数据仅供本地话题分析，不直接进入 RAG。
Cookie 只从环境变量 YSXY_COOKIE 读取，不要写入代码或提交到 Git。

PowerShell 示例：
  $env:YSXY_COOKIE = 'ys_ysxy_sess=你的会话值'
  python scripts/crawl_campus_wall.py --max-pages 5
  python scripts/crawl_campus_wall.py --start-page 1 --max-pages 1  # 增量抓首页
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from getpass import getpass
from pathlib import Path

API_URL = "https://ys.qimiaoyuanfen.com/article/article/lists"
SOURCE = "yunshang_xiaoyouquan"
REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB = REPO_ROOT / "PsyQA" / "server" / "data" / "campus_wall" / "campus_wall.db"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 "
    "MicroMessenger/7.0.20.1781 MiniProgramEnv/Windows"
)


def scrub_text(text: str) -> str:
    """移除常见直接联系方式；入库后仍需人工复核，不能视为完全匿名化。"""
    text = re.sub(r"https?://\S+", "[链接]", text)
    text = re.sub(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", "[邮箱]", text)
    text = re.sub(r"(?<!\d)1[3-9]\d{9}(?!\d)", "[手机号]", text)
    text = re.sub(
        r"(?i)(微信|vx|v信|qq)\s*[:：]?\s*[a-z0-9_-]{5,20}",
        lambda match: f"{match.group(1)}：[联系方式]",
        text,
    )
    return re.sub(r"(?<!\d)\d{5,12}(?!\d)", "[数字ID]", text).strip()


def as_int(value: object) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def normalize_post(item: dict) -> dict | None:
    post_id = str(item.get("id") or "").strip()
    content = scrub_text(str(item.get("detail") or ""))
    if not post_id or not content:
        return None
    return {
        "id": post_id,
        "source": SOURCE,
        "category_id": str(item.get("category_id") or ""),
        "category_name": str(item.get("category_name") or ""),
        "community_id": str(item.get("community_id") or ""),
        "content": content,
        "content_hash": hashlib.sha256(content.encode("utf-8")).hexdigest(),
        "created_at": str(item.get("create_time") or ""),
        "views": as_int(item.get("views")),
        "comments": as_int(item.get("count_comment")),
        "stars": as_int(item.get("count_star")),
        "hot": as_int(item.get("hot")),
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


def open_db(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS campus_posts (
            id TEXT PRIMARY KEY,
            source TEXT NOT NULL,
            category_id TEXT,
            category_name TEXT,
            community_id TEXT,
            content TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            created_at TEXT,
            views INTEGER NOT NULL DEFAULT 0,
            comments INTEGER NOT NULL DEFAULT 0,
            stars INTEGER NOT NULL DEFAULT 0,
            hot INTEGER NOT NULL DEFAULT 0,
            fetched_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_campus_posts_created_at
            ON campus_posts(created_at);
        CREATE TABLE IF NOT EXISTS crawl_state (
            source TEXT PRIMARY KEY,
            next_page INTEGER NOT NULL,
            updated_at TEXT NOT NULL
        );
        """
    )
    return conn


def save_posts(conn: sqlite3.Connection, posts: list[dict]) -> None:
    conn.executemany(
        """
        INSERT INTO campus_posts (
            id, source, category_id, category_name, community_id, content,
            content_hash, created_at, views, comments, stars, hot, fetched_at
        ) VALUES (
            :id, :source, :category_id, :category_name, :community_id, :content,
            :content_hash, :created_at, :views, :comments, :stars, :hot, :fetched_at
        )
        ON CONFLICT(id) DO UPDATE SET
            content = excluded.content,
            content_hash = excluded.content_hash,
            views = excluded.views,
            comments = excluded.comments,
            stars = excluded.stars,
            hot = excluded.hot,
            fetched_at = excluded.fetched_at
        """,
        posts,
    )
    conn.commit()


def fetch_page(page: int, page_size: int, cookie: str) -> dict:
    body = json.dumps({"page": page, "pageSize": page_size}).encode("utf-8")
    request = urllib.request.Request(
        API_URL,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
            "Referer": "https://servicewechat.com/wxe23b94e06f71e89a/160/page-frame.html",
            "Cookie": cookie,
        },
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                payload = json.loads(response.read().decode("utf-8"))
            if payload.get("code") != "0000":
                raise RuntimeError(f"接口返回错误：{payload.get('code')} {payload.get('message')}")
            return payload
        except urllib.error.HTTPError as exc:
            if exc.code in (401, 403):
                raise RuntimeError("登录态无效或已过期，请重新抓包更新 YSXY_COOKIE") from exc
            if exc.code != 429 and exc.code < 500:
                raise RuntimeError(f"HTTP {exc.code}：{exc.reason}") from exc
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            if attempt == 2:
                raise RuntimeError(f"请求失败：{exc}") from exc
        if attempt < 2:
            time.sleep(2**attempt)
    raise RuntimeError("请求重试后仍失败")


def next_saved_page(conn: sqlite3.Connection) -> int:
    row = conn.execute(
        "SELECT next_page FROM crawl_state WHERE source = ?", (SOURCE,)
    ).fetchone()
    return int(row[0]) if row else 1


def crawl(args: argparse.Namespace) -> int:
    cookie = os.environ.get("YSXY_COOKIE", "").strip()
    if not cookie:
        cookie = getpass("请粘贴真实 Cookie 后按回车（输入不会显示）：").strip()
    if not cookie:
        print("未提供 Cookie，采集取消。")
        return 2
    conn = open_db(args.db)
    page = args.start_page or next_saved_page(conn)
    total_saved = 0
    try:
        for index in range(args.max_pages):
            current_page = page + index
            payload = fetch_page(current_page, args.page_size, cookie)
            data = payload.get("data") or {}
            items = data.get("list") or []
            posts = [post for item in items if (post := normalize_post(item))]
            save_posts(conn, posts)
            total_saved += len(posts)
            print(f"第 {current_page} 页：获取 {len(items)} 条，入库 {len(posts)} 条", flush=True)
            conn.execute(
                "INSERT OR REPLACE INTO crawl_state(source, next_page, updated_at) VALUES (?, ?, ?)",
                (SOURCE, current_page + 1, datetime.now(timezone.utc).isoformat()),
            )
            conn.commit()
            actual_size = as_int(data.get("pageSize")) or args.page_size
            total = as_int(data.get("total"))
            if not items or len(items) < actual_size or (total and current_page * actual_size >= total):
                break
            if index + 1 < args.max_pages:
                time.sleep(args.delay)
    finally:
        conn.close()
    print(f"完成：本次入库 {total_saved} 条；数据库：{args.db}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="云上校友圈公开帖子本地采集")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--start-page", type=int, default=None, help="默认从上次断点继续")
    parser.add_argument("--max-pages", type=int, default=1, help="本次最多抓取页数，默认 1")
    parser.add_argument("--page-size", type=int, default=20, choices=range(1, 51))
    parser.add_argument("--delay", type=float, default=2.0, help="页间间隔秒数，最低 1 秒")
    args = parser.parse_args()
    if args.max_pages < 1 or (args.start_page is not None and args.start_page < 1):
        parser.error("页码和 max-pages 必须大于 0")
    args.delay = max(1.0, args.delay)
    try:
        return crawl(args)
    except RuntimeError as exc:
        print(f"采集停止：{exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
