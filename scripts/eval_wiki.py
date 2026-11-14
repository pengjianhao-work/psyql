#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""LLM Wiki 数据健康检查：结构、来源 id、禁止说法、危机要素、嵌入覆盖。
不造假：读不到表或没有数据时直接报 FAIL/空，不编造指标。
"""
from __future__ import annotations

import json
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "PsyQA" / "server" / "data" / "psyqa.db"

REQUIRED_HEADINGS = ["常见表现", "可能的成因", "可以尝试的做法", "什么时候该求助"]
BANNED = [
    (r"诊断|确诊|患有|得的是|症状是", "诊断性表述"),
    (r"药物|用药|吃药|开药|处方|剂量|停药|换药", "药物内容"),
    (r"治愈|根治|治疗方案|治疗步骤", "治疗承诺"),
    (r"舍曲林|氟西汀|帕罗西汀|阿普唑仑|艾司西酞普兰|劳拉西泮|奥氮平|利培酮", "具体药名"),
]
CRISIS = ("自杀", "自伤", "轻生", "想死", "创伤")
BAD_TITLE = re.compile(r"(我的|(?<!自)我|你|怎么办|吗|呢|？|\?)")
STIGMA = re.compile(r"(精神病|疯子|神经病|变态)")


def main() -> int:
    if not DB_PATH.exists():
        print("FAIL: 找不到", DB_PATH)
        return 1
    conn = sqlite3.connect("file:" + DB_PATH.as_posix() + "?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        tables = [row[0] for row in conn.execute("select name from sqlite_master where type='table'")]
        if "wiki_documents" not in tables:
            print("FAIL: wiki_documents 表不存在（先跑 npm run wiki:build）")
            return 1
        rows = list(conn.execute("select * from wiki_documents order by category, id"))
        if not rows:
            print("EMPTY: wiki_documents 还没有数据")
            return 0

        status_count = {}
        category_count = {}
        problems = []
        published = 0
        missing_source = 0
        missing_embedding = 0

        for row in rows:
            status_count[row["status"]] = status_count.get(row["status"], 0) + 1
            category_count[row["category"]] = category_count.get(row["category"], 0) + 1
            if row["status"] != "published":
                continue
            published += 1
            slug = row["id"]
            if not row["embedding_json"]:
                missing_embedding += 1
            sections = json.loads(row["sections_json"] or "[]")
            headings = [str(s.get("heading", "")) for s in sections]
            if headings != REQUIRED_HEADINGS:
                problems.append(slug + ": section 标题不符合约定")
            text = row["title"] + row["summary"] + "".join(str(s.get("body", "")) for s in sections)
            for pattern, label in BANNED:
                if re.search(pattern, text):
                    problems.append(slug + ": " + label)
            if BAD_TITLE.search(row["title"]):
                problems.append(slug + ": title 仍像个案提问")
            if STIGMA.search(text):
                problems.append(slug + ": 出现污名化表述")
            if any(term in text for term in CRISIS) and not re.search(r"400-161-9995|120|心理中心|可信的人", text):
                problems.append(slug + ": 危机相关但缺少安全求助信息")
            sources = json.loads(row["sources_json"] or "[]")
            for source in sources:
                doc_id = source.get("docId")
                if not doc_id:
                    problems.append(slug + ": 来源缺少 docId")
                    continue
                exists = conn.execute("select 1 from vector_documents where id = ?", (doc_id,)).fetchone()
                if not exists:
                    missing_source += 1
                    problems.append(slug + ": 来源 docId 不存在 " + str(doc_id))

        print("wiki 总页数:", len(rows))
        print("状态分布:", status_count)
        print("分类分布:", category_count)
        print("已发布:", published, "| 无嵌入:", missing_embedding, "| 来源 docId 缺失:", missing_source)
        if problems:
            print("FAIL: 发现", len(problems), "个问题")
            for item in problems[:20]:
                print("  -", item)
            return 1
        print("PASS: 结构、来源 id、禁止说法、危机要素全部通过")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
