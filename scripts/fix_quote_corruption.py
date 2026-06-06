#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""修复误用正则批量替换导致的缺失引号（不触碰 (?= 等合法正则）。"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "PsyQA" / "server" / "src"


def fix_text(text: str) -> str:
    # import / from 语句末尾缺引号
    text = re.sub(r"from '([^'\n]+);", r"from '\1';", text)
    text = re.sub(r"from \"([^\"\n]+);", r'from "\1";', text)

    # const x = ... || 'value;
    text = re.sub(r"\|\| '([^'\n]+);", r"|| '\1';", text)

    # dynamic import
    text = re.sub(r"import\('([^'\n]+);", r"import('\1');", text)
    text = re.sub(r"import\('chromadb\)\.", "import('chromadb').", text)

    # setHeader / 常见字符串参数
    text = re.sub(
        r"setHeader\('([^']*)\)",
        lambda m: f"setHeader('{m.group(1)}')" if m.group(1).count("'") == 0 else m.group(0),
        text,
    )

    # .trim(') 误替换
    text = text.replace(".trim(')", ".trim()")

    # level / 枚举字符串
    for w in ("error", "warn", "debug", "info", "unknown"):
        text = text.replace(f"'{w})", f"'{w}')")
        text = text.replace(f"=== '{w})", f"=== '{w}')")
        text = text.replace(f"LOG_LEVEL === '{w})", f"LOG_LEVEL === '{w}')")

    # type LogLevel = '... | 'debug 缺引号
    text = re.sub(
        r"type LogLevel = 'info' \| 'warn' \| 'error' \| 'debug;",
        "type LogLevel = 'info' | 'warn' | 'error' | 'debug';",
        text,
    )

    # console.warn 缺引号逗号
    text = re.sub(
        r"console\.warn\('(\[[^\]]+\])[^,]*:,",
        r"console.warn('\1',",
        text,
    )

    # stream handler 损坏
    text = text.replace("text'})'", "text })")
    text = text.replace("elapsedMs)' }", "elapsedMs) });")
    text = text.replace("});';", "});")
    text = text.replace("});'}", "});")
    text = text.replace("});'};", "});")

    # replace(/.../gi, '); 缺引号（字面替换常见损坏）
    text = text.replace("replace(/[^\\n]/gi, ');", "replace(/[^\\n]/gi, '');")

    # join 损坏
    text = text.replace(".join('、)}`);'}", ".join('、')}`);")
    text = text.replace(".join('、)}`);", ".join('、')}`);")

    # resolve callback
    text = re.sub(
        r"resolve\(\{ code: code \?\? 1, output'\}\)\);' \}\);'\}",
        "resolve({ code: code ?? 1, output }));",
        text,
    )

    # metadata 损坏
    text = text.replace(
        "metadata: { hnsw_space: 'cosine', ...metadata'}' });'}",
        "metadata: { hnsw_space: 'cosine', ...metadata } });",
    )

    # PSYQA_CHROMA_ENABLED === true 缺引号
    text = text.replace(
        "process.env.PSYQA_CHROMA_ENABLED === true)",
        "process.env.PSYQA_CHROMA_ENABLED === 'true')",
    )

    # 测试字符串
    text = text.replace("'宿舍矛盾怎么办))", "'宿舍矛盾怎么办')")
    text = text.replace("'高三喜欢一个没有联系的人))", "'高三喜欢一个没有联系的人')")

    # 空字符串 '' 被损坏为 ')' 或 ')
    text = re.sub(r"\|\| '\)", "|| '')", text)
    text = re.sub(r"\|\| '\)'", "|| '')", text)

    # ?? 'word; 缺引号
    text = re.sub(r"\?\? '([^'\n]+);", r"?? '\1';", text)

    # startsWith / includes / === 字符串参数缺闭合引号
    text = re.sub(r"startsWith\('([^'\)]+)\)", r"startsWith('\1')", text)
    text = re.sub(r"=== '([^'\)]+)\)", r"=== '\1')", text)
    text = re.sub(r"!== '([^'\)]+)\)", r"!== '\1')", text)
    text = re.sub(r"\.includes\('([^'\)]+)\)", r".includes('\1')", text)

    # console.error('msg:, error)
    text = re.sub(r"console\.error\('([^:]+):,\s*error\)", r"console.error('\1:', error)", text)

    # setHeader 常见损坏
    for hdr in (
        "text/event-stream; charset=utf-8",
        "no-cache, no-transform",
        "keep-alive",
    ):
        text = text.replace(f"setHeader('{hdr})", f"setHeader('{hdr}')")

    # env secret 检查
    text = text.replace("'change-me)", "'change-me')")
    text = text.replace(
        "'psyqa-dev-secret-change-me-local-only)",
        "'psyqa-dev-secret-change-me-local-only')",
    )

    # 流式回调与多余括号
    text = text.replace(
        "onToken: (text) => sendEvent({ type: 'token', text }) });",
        "onToken: (text) => sendEvent({ type: 'token', text }),\n    });",
    )
    text = text.replace("}););", "});")
    text = text.replace("});;;", "});")
    text = text.replace("});;", "});")

    # getQuestionById 缺 }
    text = text.replace(
        "return res.status(404).json({ error: 'Question not found' });\n  \n  res.json(question);",
        "return res.status(404).json({ error: 'Question not found' });\n  }\n\n  res.json(question);",
    )

    # clearUserHistory 缺 };
    text = text.replace(
        "res.json({ message: 'History cleared successfully' });;",
        "res.json({ message: 'History cleared successfully' });\n};",
    )

    # regex replace 第二参数损坏
    text = re.sub(r"/gi,\s*'\);", "/gi, '');", text)

    # 常见中文 includes
    text = text.replace("'不能替代医疗诊断))", "'不能替代医疗诊断')")
    text = text.replace("'生成中);", "'生成中');")
    text = text.replace("'生成中) ??", "'生成中') ??")
    text = text.replace("'详细心理评估报告生成中) ??", "'详细心理评估报告生成中') ??")

    # portrait / localeCompare 等
    text = text.replace("value || ').toLowerCase()", "value || '').toLowerCase()")
    text = text.replace("obj.recommendedFocus || ').trim()", "obj.recommendedFocus || '').trim()")
    text = text.replace("|| ').trim()", "|| '').trim()")
    text = text.replace(
        "(b.lastConsultTime || ').localeCompare(a.lastConsultTime || '))",
        "(b.lastConsultTime || '').localeCompare(a.lastConsultTime || '')",
    )
    text = text.replace("(description || ')'", "(description || ''")
    text = text.replace("question + (description || ')'", "question + (description || '')")

    return text


def main() -> None:
    n = 0
    for fp in ROOT.rglob("*.ts"):
        if "export * from" in fp.read_text(encoding="utf-8", errors="replace")[:60]:
            continue
        raw = fp.read_text(encoding="utf-8", errors="replace")
        fixed = fix_text(raw)
        if fixed != raw:
            fp.write_text(fixed, encoding="utf-8")
            print(f"[fix] {fp.relative_to(ROOT.parent.parent)}")
            n += 1
    print(f"fixed {n} files")


if __name__ == "__main__":
    main()
