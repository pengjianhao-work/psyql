"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aggregateUserProfile = aggregateUserProfile;
exports.saveUserProfile = saveUserProfile;
exports.getStoredUserProfile = getStoredUserProfile;
exports.refreshUserProfile = refreshUserProfile;
exports.getOrRefreshUserProfile = getOrRefreshUserProfile;
const database_1 = require("../../db/database");
const feedbackStore_1 = require("../../db/feedbackStore");
const emotionService_1 = require("../psych/emotionService");
const GROUP_RULES = {
    学业: ['学习', '考试', '考研', '作业', '绩点', '论文'],
    人际: ['人际', '朋友', '室友', '同学', '社交', '孤独'],
    情绪: ['焦虑', '抑郁', '烦躁', '紧张', '情绪', '压力'],
    家庭: ['家庭', '父母', '家人'],
    恋爱: ['恋爱', '失恋', '感情', '分手'],
    未来: ['就业', '未来', '方向', '迷茫', '职业']
};
function countDialogs(userId) {
    const row = (0, database_1.getDb)()
        .prepare('SELECT COUNT(*) as c FROM dialogs WHERE user_id = ?')
        .get(userId);
    return row.c;
}
function loadRecentPsychSnapshots(userId, limit = 30) {
    const rows = (0, database_1.getDb)()
        .prepare(`SELECT psych_json FROM dialogs
       WHERE user_id = ? AND psych_json IS NOT NULL
       ORDER BY id DESC LIMIT ?`)
        .all(userId, limit);
    const out = [];
    for (const row of rows) {
        try {
            out.push(JSON.parse(row.psych_json));
        }
        catch (_a) {
            /* skip */
        }
    }
    return out;
}
function loadRecentSummaries(userId, limit = 8) {
    const rows = (0, database_1.getDb)()
        .prepare(`SELECT summary FROM dialogs WHERE user_id = ? ORDER BY id DESC LIMIT ?`)
        .all(userId, limit);
    return rows.map((r) => r.summary).filter(Boolean);
}
function aggregateTopConcerns(snapshots) {
    const counts = new Map();
    for (const s of snapshots) {
        const cat = s.problem || 'other';
        counts.set(cat, (counts.get(cat) || 0) + 1);
    }
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([category, count]) => ({
        category,
        label: (0, emotionService_1.getCategoryName)(category),
        count
    }));
}
function aggregateDominantEmotion(snapshots) {
    if (!snapshots.length)
        return { emotion: null, label: null };
    const counts = new Map();
    for (const s of snapshots) {
        counts.set(s.emotion, (counts.get(s.emotion) || 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!top)
        return { emotion: null, label: null };
    return { emotion: top[0], label: (0, emotionService_1.getEmotionLabel)(top[0]) };
}
function aggregateThemes(summaries) {
    const themes = new Set();
    for (const summary of summaries) {
        for (const [theme, keywords] of Object.entries(GROUP_RULES)) {
            if (keywords.some((k) => summary.includes(k)))
                themes.add(theme);
        }
    }
    return [...themes].slice(0, 6);
}
function buildSummaryText(sessionCount, concerns, emotionLabel, avgStress, feedbackCount, avgRating, themes) {
    if (sessionCount === 0) {
        return '暂无咨询记录，完成首次对话后将生成你的基础画像。';
    }
    const parts = [`累计咨询 ${sessionCount} 次`];
    if (concerns.length) {
        parts.push(`主要困扰领域：${concerns.slice(0, 3).map((c) => c.label).join('、')}`);
    }
    if (emotionLabel) {
        parts.push(`近期常见情绪：${emotionLabel}`);
    }
    if (avgStress !== null && avgStress >= 60) {
        parts.push('压力负荷整体偏高，建议保持规律作息与适度运动');
    }
    else if (avgStress !== null && avgStress <= 40) {
        parts.push('压力水平相对平稳');
    }
    if (themes.length) {
        parts.push(`反复出现的主题：${themes.join('、')}`);
    }
    if (feedbackCount > 0 && avgRating !== null) {
        parts.push(`历史反馈均分 ${avgRating.toFixed(1)}/5`);
    }
    return parts.join('；') + '。';
}
function aggregateUserProfile(userId) {
    const sessionCount = countDialogs(userId);
    const snapshots = loadRecentPsychSnapshots(userId);
    const summaries = loadRecentSummaries(userId);
    const feedback = (0, feedbackStore_1.listSessionFeedback)(userId);
    const topConcerns = aggregateTopConcerns(snapshots);
    const { emotion: dominantEmotion, label: dominantEmotionLabel } = aggregateDominantEmotion(snapshots);
    let stressSum = 0;
    let stressN = 0;
    let anxietySum = 0;
    let anxietyN = 0;
    for (const s of snapshots) {
        if (typeof s.stressLevel === 'number') {
            stressSum += s.stressLevel;
            stressN++;
        }
        if (typeof s.anxietyLevel === 'number') {
            anxietySum += s.anxietyLevel;
            anxietyN++;
        }
    }
    const rated = feedback.filter((f) => f.rating !== null);
    const helpfulRated = feedback.filter((f) => f.helpful !== null);
    const avgRating = rated.length > 0
        ? rated.reduce((sum, f) => sum + f.rating, 0) / rated.length
        : null;
    const helpfulRate = helpfulRated.length > 0
        ? helpfulRated.filter((f) => f.helpful).length / helpfulRated.length
        : null;
    const recentThemes = aggregateThemes(summaries);
    const updatedAt = new Date().toISOString();
    const profile = {
        userId,
        sessionCount,
        feedbackCount: feedback.length,
        avgRating: avgRating !== null ? Math.round(avgRating * 10) / 10 : null,
        helpfulRate: helpfulRate !== null ? Math.round(helpfulRate * 100) / 100 : null,
        topConcerns,
        dominantEmotion,
        dominantEmotionLabel,
        avgStressLevel: stressN ? Math.round(stressSum / stressN) : null,
        avgAnxietyLevel: anxietyN ? Math.round(anxietySum / anxietyN) : null,
        recentThemes,
        summary: buildSummaryText(sessionCount, topConcerns, dominantEmotionLabel, stressN ? stressSum / stressN : null, feedback.length, avgRating, recentThemes),
        updatedAt
    };
    return profile;
}
function saveUserProfile(profile) {
    (0, database_1.getDb)()
        .prepare(`INSERT INTO user_profile(user_id, session_count, feedback_count, avg_rating, helpful_rate, profile_json, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         session_count = excluded.session_count,
         feedback_count = excluded.feedback_count,
         avg_rating = excluded.avg_rating,
         helpful_rate = excluded.helpful_rate,
         profile_json = excluded.profile_json,
         updated_at = excluded.updated_at`)
        .run(profile.userId, profile.sessionCount, profile.feedbackCount, profile.avgRating, profile.helpfulRate, JSON.stringify(profile), profile.updatedAt);
}
function getStoredUserProfile(userId) {
    const row = (0, database_1.getDb)()
        .prepare('SELECT profile_json, session_count FROM user_profile WHERE user_id = ?')
        .get(userId);
    if (!row)
        return null;
    try {
        const profile = JSON.parse(row.profile_json);
        const currentCount = countDialogs(userId);
        if (profile.sessionCount !== currentCount)
            return null;
        return profile;
    }
    catch (_a) {
        return null;
    }
}
function refreshUserProfile(userId) {
    const profile = aggregateUserProfile(userId);
    saveUserProfile(profile);
    return profile;
}
function getOrRefreshUserProfile(userId) {
    const cached = getStoredUserProfile(userId);
    if (cached)
        return cached;
    return refreshUserProfile(userId);
}
