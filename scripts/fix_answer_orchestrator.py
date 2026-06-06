#!/usr/bin/env python3
"""修复 answerOrchestrator.ts 中缺失的字符串闭合引号。"""
from pathlib import Path

FP = Path(__file__).resolve().parent.parent / "PsyQA/server/src/services/question/answerOrchestrator.ts"

REPLACEMENTS = [
    (".replace(/\\n{3,}/g, '\\n\\n).trim();", ".replace(/\\n{3,}/g, '\\n\\n').trim();"),
    (".replace(/^[,，、。\\s]+/, ').trim();", ".replace(/^[,，、。\\s]+/, '').trim();"),
    (", ').trim();", ", '').trim();"),
    (".replace(re, ').trim();", ".replace(re, '').trim();"),
    (".replace(/[①②③④⑤]/g, ')", ".replace(/[①②③④⑤]/g, '')"),
    (".map((s) => s.replace(/^\\s*\\d+\\.\\s*/, ').trim()", ".map((s) => s.replace(/^\\s*\\d+\\.\\s*/, '').trim()"),
    (".join(' · );'}", ".join(' · ');}"),
    (".replace(/\\s+/g, ' ).trim();", ".replace(/\\s+/g, ' ').trim();"),
    ("if (knowledge.length === 0) return ';", "if (knowledge.length === 0) return '';"),
    (".join('\\n);'}", ".join('\\n');}"),
    (
        "cut.lastIndexOf('\\n\\n), cut.lastIndexOf('无), cut.lastIndexOf('无))",
        "cut.lastIndexOf('\\n\\n'), cut.lastIndexOf('。'), cut.lastIndexOf('！'))",
    ),
    ("  return ';\n}", "  return '';\n}"),
    ("      : ';", "      : '';"),
    ("].join('\\n);", "].join('\\n');"),
    ("(description || ')'", "(description || '')"),
    ("question + (description || ')'", "question + (description || '')"),
    ("if (!answer.includes('不能替代医疗诊断)) {", "if (!answer.includes('不能替代医疗诊断')) {"),
    ("/gi, ');", "/gi, '');"),
    ("/gi, ' )", "/gi, '')"),
    ("new RegExp(`^${qEsc}[，,、\\\\s]*`), ').trim();", "new RegExp(`^${qEsc}[，,、\\\\s]*`), '').trim();"),
    ("text = afterDear.replace(new RegExp(`^${qEsc}[，,、\\\\s]*`), ').trim();", "text = afterDear.replace(new RegExp(`^${qEsc}[，,、\\\\s]*`), '').trim();"),
]

def main() -> None:
    text = FP.read_text(encoding="utf-8", errors="replace")
    orig = text
    for old, new in REPLACEMENTS:
        text = text.replace(old, new)
    # 通用：`, ')` -> `, '')` 在 .replace( 调用中
    import re

    text = re.sub(r"\.replace\(([^,]+),\s*'\)", r".replace(\1, '')", text)
    text = re.sub(r"return ';", "return '';", text)
    if text != orig:
        FP.write_text(text, encoding="utf-8")
        print("fixed answerOrchestrator.ts")
    else:
        print("no changes")


if __name__ == "__main__":
    main()
