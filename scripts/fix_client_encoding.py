# -*- coding: utf-8 -*-
"""Repair truncated UTF-8 in client source files."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "PsyQA" / "client" / "src"

REPLACEMENTS = [
    ("'我感觉很孤独，没有朋\uFFFD?,", "'我感觉很孤独，没有朋友',"),
    ("'和室友关系不好，很烦\uFFFD?,", "'和室友关系不好，很烦恼',"),
    ("'担心未来找不到工\uFFFD?,", "'担心未来找不到工作',"),
    ("'总是情绪低落，提不起\uFFFD?", "'总是情绪低落，提不起劲'"),
    ("'担心未来找不到工\uFFFD?],", "'担心未来找不到工作'],"),
    ("'和室友关系不好，很烦\uFFFD?, '我感觉很孤独，没有朋\uFFFD?],", "'和室友关系不好，很烦恼', '我感觉很孤独，没有朋友'],"),
    ("'总是情绪低落，提不起\uFFFD?],", "'总是情绪低落，提不起劲'],"),
    ("'和恋人经常吵架，不知道怎么\uFFFD?, '暧昧关系让我很焦\uFFFD?],", "'和恋人经常吵架，不知道怎么办', '暧昧关系让我很焦虑'],"),
    ("'家里期望和我自己的想法冲\uFFFD?],", "'家里期望和我自己的想法冲突'],"),
    ("'不确定自己适合什么方\uFFFD?,", "'不确定自己适合什么方向',"),
    ("date: `\uFFFD?{index + 1}次`,", "date: `第${index + 1}次`,"),
    ("pushToast('历史会话的报告与画像已同\uFFFD?, 'success');", "pushToast('历史会话的报告与画像已同步', 'success');"),
    ("includes('生成\uFFFD?))", "includes('生成中'))"),
    ("includes('详细心理评估报告生成\uFFFD?))", "includes('详细心理评估报告生成中'))"),
    ("content: `分类加载失败\uFFFD?{getErrorMessage(error)}`,", "content: `分类加载失败：${getErrorMessage(error)}`,"),
    ("pushToast('正在回复上一条消息，请稍候\uFFFD?, 'info');", "pushToast('正在回复上一条消息，请稍候', 'info');"),
    ("label: '检\uFFFD?,", "label: '检测',"),
    ("pushToast('回复已生成；详细报告与画像正在后台生\uFFFD?, 'info', {", "pushToast('回复已生成；详细报告与画像正在后台生成', 'info', {"),
    ("pushToast('报告生成超时，可点击状态栏「刷新报告与趋势」重\uFFFD?, 'warning', {", "pushToast('报告生成超时，可点击状态栏「刷新报告与趋势」重试', 'warning', {"),
    ("content: '我想继续确认你的状态：你现在身边有可以立即联系的人吗？如果愿意，我可以帮你做一\uFFFD?步安全行动清单\uFFFD?,", "content: '我想继续确认你的状态：你现在身边有可以立即联系的人吗？如果愿意，我可以帮你做一份 3 步安全行动清单。',"),
    ("pushToast('上一条消息还在处理中，请稍候再\uFFFD?, 'info');", "pushToast('上一条消息还在处理中，请稍候再试', 'info');"),
    ("'无法连接后端。请确认已运行「一键启\uFFFD?bat」，或重\uFFFD?npm run dev 后重\uFFFD?,", "'无法连接后端。请确认已运行「一键启动.bat」，或重启 npm run dev 后重试',"),
    ("content: `抱歉，我暂时无法回答您的问题\uFFFD?{getErrorMessage(error)}`,", "content: `抱歉，我暂时无法回答您的问题：${getErrorMessage(error)}`,"),
    ("content: `清空历史失败\uFFFD?{getErrorMessage(error)}`,", "content: `清空历史失败：${getErrorMessage(error)}`,"),
    ("pushToast('仍在生成中，请稍后再点刷\uFFFD?, 'warning');", "pushToast('仍在生成中，请稍后再点刷新', 'warning');"),
    ("pushToast(`刷新失败\uFFFD?{getErrorMessage(error)}`, 'warning');", "pushToast(`刷新失败：${getErrorMessage(error)}`, 'warning');"),
    (".map(([group, items]) => `\uFFFD?{group}\uFFFD?{items.length}条`)", ".map(([group, items]) => `${group}：${items.length}条`)"),
    ("`用户\uFFFD?{currentUserLabel}`,", "`用户：${currentUserLabel}`,"),
    ("`导出时间\uFFFD?{new Date().toLocaleString('zh-CN')}`,", "`导出时间：${new Date().toLocaleString('zh-CN')}`,"),
    ("? '游客 · 仅本\uFFFD?", "? '游客 · 仅本地'"),
    ("? `已登\uFFFD?· @{sessionUser.username}`", "? `已登录 · @{sessionUser.username}`"),
    ("aria-label={sidebarOpen ? '关闭侧边\uFFFD? : '打开侧边\uFFFD?}", "aria-label={sidebarOpen ? '关闭侧边栏' : '打开侧边栏'}"),
    ("            \uFFFD?          </button>", "            ☰\n          </button>"),
    ("<h1>心理港湾 · 学生\uFFFD?/h1>", "<h1>心理港湾 · 学生端</h1>"),
    ("                  待完\uFFFD?                </span>", "                  待完善\n                </span>"),
    (": '已登\uFFFD?", ": '已登录'"),
    ("? '退出登\uFFFD? : '返回登录'", "? '退出登录' : '返回登录'"),
    ('aria-label="关闭侧边\uFFFD?', 'aria-label="关闭侧边栏"'),
    ("{insightsOpen ? '收起趋势与报\uFFFD?\uFFFD? : '展开趋势与报\uFFFD?\uFFFD?}", "{insightsOpen ? '收起趋势与报告 ▲' : '展开趋势与报告 ▼'}"),
    ("{(portraitPending || reportPending) && ' · 生成\uFFFD?}", "{(portraitPending || reportPending) && ' · 生成中'}"),
    ("{isAdmin ? '管理\uFFFD? : '辅导\uFFFD?}权限说明", "{isAdmin ? '管理员' : '辅导员'}权限说明"),
    ("{open ? '\uFFFD? : '\uFFFD?}", "{open ? '▼' : '▶'}"),
    ("? '您可访问全校学生数据，并管理用户与导出报表\uFFFD?", "? '您可访问全校学生数据，并管理用户与导出报表。'"),
    (": '您仅可访问管辖院系内的学生与告警；对话原文需学生授权\uFFFD?}", ": '您仅可访问管辖院系内的学生与告警；对话原文需学生授权。'}"),
    ("{isAdmin ? '管理\uFFFD? : '您的权限'}", "{isAdmin ? '管理员' : '您的权限'}"),
    ("系统权限标识\uFFFD?", "系统权限标识："),
    ('<p className="user-profile-loading">加载中\uFFFD?/p>', '<p className="user-profile-loading">加载中…</p>'),
    ('<p className="user-profile-empty">完成咨询后将自动生成跨会话的基础画像\uFFFD?/p>', '<p className="user-profile-empty">完成咨询后将自动生成跨会话的基础画像。</p>'),
    ("<span>咨询 {profile.sessionCount} \uFFFD?/span>", "<span>咨询 {profile.sessionCount} 次</span>"),
    ("<span>反馈 {profile.feedbackCount} \uFFFD?/span>", "<span>反馈 {profile.feedbackCount} 次</span>"),
    ("<strong>近期状\uFFFD?/strong>", "<strong>近期状态</strong>"),
    ("`常见情绪\uFFFD?{profile.dominantEmotionLabel}`", "`常见情绪：${profile.dominantEmotionLabel}`"),
    ("<h3>🏷\uFFFD?问题分类</h3>", "<h3>🏷️ 问题分类</h3>"),
    ("setError('请选择评分、是否有帮助，或填写简短反\uFFFD?);", "setError('请选择评分、是否有帮助，或填写简短反馈');"),
    ("<p>感谢你的反馈，将帮助我们更好地陪伴你\uFFFD?/p>", "<p>感谢你的反馈，将帮助我们更好地陪伴你。</p>"),
    ('<span className="session-feedback-label">整体满意\uFFFD?/span>', '<span className="session-feedback-label">整体满意度</span>'),
    ("              \uFFFD?", "              ★"),
    ('<span className="session-feedback-label">这次回复有帮助吗\uFFFD?/span>', '<span className="session-feedback-label">这次回复有帮助吗？</span>'),
    ("            有帮\uFFFD?", "            有帮助"),
    ('          placeholder="例如：希望多给一些具体做法\uFFFD?', '          placeholder="例如：希望多给一些具体做法"'),
    ("{submitting ? '提交中\uFFFD? : '提交反馈'}", "{submitting ? '提交中…' : '提交反馈'}"),
    ("  fast: '快速模\uFFFD?· 未启用大模型'", "  fast: '快速模式 · 未启用大模型'"),
    ("<strong>后端未连\uFFFD?/strong>", "<strong>后端未连接</strong>"),
    ("· 请在 .env 配置 ZHIPU_API_KEY（智谱永久免费）或启\uFFFD?Ollama", "· 请在 .env 配置 ZHIPU_API_KEY（智谱永久免费）或启用 Ollama"),
    ('<span className="muted"> · 使用「一键启动」可恢复大模型模\uFFFD?/span>', '<span className="muted"> · 使用「一键启动」可恢复大模型模式</span>'),
    ("<strong>后端服务未连\uFFFD?/strong>", "<strong>后端服务未连接</strong>"),
    ("请运行「一键启\uFFFD?bat」或 ", "请运行「一键启动.bat」或 "),
]

def main() -> None:
    files = list(ROOT.rglob("*.tsx")) + list(ROOT.rglob("*.ts"))
    for fp in files:
        text = fp.read_text(encoding="utf-8", errors="replace")
        orig = text
        for old, new in REPLACEMENTS:
            text = text.replace(old, new)
        if text != orig:
            fp.write_text(text, encoding="utf-8")
            print("fixed", fp.relative_to(ROOT))

    remaining = [
        str(p.relative_to(ROOT))
        for p in files
        if "\ufffd" in p.read_text(encoding="utf-8", errors="replace")
    ]
    print("remaining:", remaining or "none")


if __name__ == "__main__":
    main()
