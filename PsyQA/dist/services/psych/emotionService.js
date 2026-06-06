"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROBLEM_KEYWORDS = void 0;
exports.analyzeEmotion = analyzeEmotion;
exports.assessRisk = assessRisk;
exports.analyzeProblem = analyzeProblem;
exports.getEmotionStyle = getEmotionStyle;
exports.getEmotionLabel = getEmotionLabel;
exports.getRiskLabel = getRiskLabel;
exports.getCategoryName = getCategoryName;
exports.formatEmotionReport = formatEmotionReport;
const psychTextAnalysis_1 = require("../../utils/psychTextAnalysis");
const EMOTION_KEYWORDS = {
    happy: ['开心', '高兴', '快乐', '愉快', '幸福', '满足', '欣慰', '兴奋', '喜悦', '成就感'],
    sad: ['难过', '伤心', '失落', '沮丧', '失望', '绝望', '无助', '悲伤', '痛苦', '心碎', '想哭', '低落'],
    anxious: ['焦虑', '紧张', '担心', '害怕', '恐惧', '不安', '压力', '忧虑', '着急', '心慌', '睡不着'],
    angry: ['生气', '愤怒', '恼火', '不满', '怨恨', '讨厌', '气死了', '烦躁', '发火'],
    lonely: ['孤独', '寂寞', '孤单', '没人理解', '孤立', '疏远', '没人陪'],
    neutral: [],
    hopeful: ['希望', '期待', '信心', '相信', '乐观', '积极', '盼望'],
    confused: ['迷茫', '困惑', '不知所措', '不清楚', '不明白', '不知道怎么办'],
    frustrated: ['挫败', '泄气', '无奈', '力不从心', '做不好'],
    guilty: ['内疚', '自责', '愧疚', '对不起'],
    shameful: ['羞愧', '耻辱', '丢人', '尴尬', '没脸'],
    proud: ['自豪', '骄傲', '得意', '有成就感']
};
exports.PROBLEM_KEYWORDS = {
    academic_stress: ['学习', '考试', '考研', '高考', '作业', '成绩', '复习', '学习压力', '考试压力', '挂科', '学分', '绩点', '论文', '答辩'],
    interpersonal: ['朋友', '室友', '同学', '社交', '朋友关系', '宿舍关系', '同学关系', '社交恐惧', '社恐', '人际沟通'],
    family_relationship: ['父母', '家人', '妈妈', '爸爸', '家庭', '亲情', '家庭矛盾', '父母期望', '代沟'],
    romantic_relationship: ['恋爱', '失恋', '感情', '喜欢', '分手', '暗恋', '表白', '异地恋'],
    career_future: ['迷茫', '未来', '方向', '目标', '选择', '就业', '工作', '职业规划', '前途', '出路'],
    self_identity: ['自信', '自卑', '自我', '价值', '自我认同', '自我怀疑', '自尊心'],
    emotion_regulation: ['情绪', '心情', '调节', '控制', '管理', '情绪问题', '情绪波动', '情绪失控'],
    body_image: ['身材', '外貌', '体重', '颜值', '身材焦虑', '外貌焦虑', '减肥', '整容'],
    addiction: ['游戏', '手机', '网络', '熬夜', '上瘾', '沉迷', '游戏上瘾', '手机依赖'],
    trauma: ['创伤', '阴影', '回忆', '伤害', '痛苦经历', '心理阴影', '童年阴影'],
    other: []
};
const CRISIS_KEYWORDS = {
    suicide: ['自杀', '想死', '不想活', '结束生命', '跳楼', '割腕', '自缢', '跳河', '上吊', '服毒', '自尽', '寻死'],
    selfharm: ['自残', '伤害自己', '割手', '撞墙', '自虐', '打自己', '咬自己'],
    desperate: ['绝望', '没有希望', '活不下去', '生不如死', '毫无意义', '彻底绝望', '心死了'],
    collapse: ['崩溃', '撑不住', '快疯了', '精神崩溃', '情绪崩溃', '撑不下去'],
    violence: ['杀人', '报复', '伤害别人', '打别人', '砍人', '攻击别人']
};
const CRISIS_HOTLINE = '全国心理援助热线：400-161-9995';
function scoreEmotionCategories(text) {
    const scores = {};
    const foundKeywords = {};
    Object.keys(EMOTION_KEYWORDS).forEach((emotion) => {
        const { score, matched } = (0, psychTextAnalysis_1.scoreKeywordMatches)(text, EMOTION_KEYWORDS[emotion]);
        scores[emotion] = score;
        foundKeywords[emotion] = matched;
    });
    return { scores, foundKeywords };
}
function analyzeEmotion(text, prior) {
    const textLower = text.toLowerCase();
    const { scores, foundKeywords } = scoreEmotionCategories(textLower);
    let maxScore = 0;
    let detectedEmotion = 'neutral';
    for (const emotion of Object.keys(scores)) {
        if (scores[emotion] > maxScore) {
            maxScore = scores[emotion];
            detectedEmotion = emotion;
        }
    }
    const sortedEmotions = Object.keys(scores)
        .filter((e) => scores[e] > 0)
        .sort((a, b) => scores[b] - scores[a]);
    const secondaryEmotions = sortedEmotions.filter((e) => e !== detectedEmotion).slice(0, 3);
    const allKeywords = sortedEmotions.flatMap((e) => foundKeywords[e]);
    let confidence = (0, psychTextAnalysis_1.normalizeConfidence)(maxScore);
    if (prior && maxScore === 0 && prior.confidence >= 0.4) {
        detectedEmotion = prior.emotion;
        confidence = Math.max(0.3, prior.confidence * 0.75);
    }
    else if (prior && maxScore > 0 && confidence < 0.45 && prior.confidence >= 0.5) {
        confidence = confidence * 0.6 + prior.confidence * 0.4;
    }
    return {
        emotion: detectedEmotion,
        confidence,
        keywords: [...new Set(allKeywords)],
        secondaryEmotions
    };
}
function assessRisk(text) {
    const textLower = text.toLowerCase();
    const foundKeywords = [];
    let level = 'low';
    let warningMessage = '';
    const applyLevel = (next, msg) => {
        const order = ['low', 'medium', 'high', 'critical'];
        if (order.indexOf(next) > order.indexOf(level)) {
            level = next;
            if (msg)
                warningMessage = msg;
        }
    };
    for (const [type, keywords] of Object.entries(CRISIS_KEYWORDS)) {
        const sorted = [...keywords].sort((a, b) => b.length - a.length);
        for (const kw of sorted) {
            let idx = 0;
            while ((idx = textLower.indexOf(kw, idx)) !== -1) {
                if ((0, psychTextAnalysis_1.isLikelyThirdPersonCrisisMention)(textLower, idx)) {
                    idx += kw.length;
                    continue;
                }
                foundKeywords.push(kw);
                if (type === 'suicide') {
                    applyLevel('critical', '⚠️ 检测到严重危机信号！生命宝贵，请立即联系专业心理咨询师或拨打心理援助热线！');
                }
                else if (type === 'violence') {
                    applyLevel('critical', '⚠️ 检测到伤害他人的倾向！请冷静下来，寻求专业帮助！');
                }
                else if (type === 'selfharm') {
                    applyLevel('high', '⚠️ 检测到伤害自己的想法，这很危险，请立即寻求专业帮助！');
                }
                else if (type === 'desperate') {
                    applyLevel('medium', '⚠️ 您的情绪状态需要关注，建议与信任的人沟通或寻求专业帮助。');
                }
                else if (type === 'collapse') {
                    applyLevel('medium', '⚠️ 您的情绪接近崩溃边缘，请及时调整状态或寻求帮助。');
                }
                idx += kw.length;
            }
        }
    }
    return {
        level,
        keywords: [...new Set(foundKeywords)],
        warningMessage,
        hotline: CRISIS_HOTLINE
    };
}
function analyzeProblem(text) {
    const textLower = text.toLowerCase();
    const scores = {};
    const foundKeywords = {};
    Object.keys(exports.PROBLEM_KEYWORDS).forEach((cat) => {
        const { score, matched } = (0, psychTextAnalysis_1.scoreKeywordMatches)(textLower, exports.PROBLEM_KEYWORDS[cat]);
        scores[cat] = score;
        foundKeywords[cat] = matched;
    });
    let maxScore = 0;
    let detectedCategory = 'other';
    for (const category of Object.keys(scores)) {
        if (scores[category] > maxScore) {
            maxScore = scores[category];
            detectedCategory = category;
        }
    }
    const allKeywords = Object.keys(foundKeywords).flatMap((c) => foundKeywords[c]);
    const confidence = (0, psychTextAnalysis_1.normalizeConfidence)(maxScore, 5);
    const subcategories = getSubcategories(detectedCategory);
    return {
        category: maxScore > 0 ? detectedCategory : 'other',
        confidence,
        keywords: [...new Set(allKeywords)],
        subcategories
    };
}
function getSubcategories(category) {
    const subcategories = {
        academic_stress: ['考试焦虑', '作业压力', '成绩压力', '升学压力', '论文写作', '答辩准备'],
        interpersonal: ['宿舍关系', '同学矛盾', '交友困难', '社交恐惧', '孤独感', '人际边界'],
        family_relationship: ['父母期望', '家庭矛盾', '代沟问题', '亲情缺失', '家庭沟通'],
        romantic_relationship: ['失恋痛苦', '暗恋烦恼', '恋爱矛盾', '异地恋', '感情迷茫'],
        career_future: ['职业迷茫', '就业压力', '考研困惑', '未来规划', '专业选择'],
        self_identity: ['自信心不足', '自我怀疑', '价值认同', '性格困扰', '成长困惑'],
        emotion_regulation: ['情绪失控', '焦虑调节', '抑郁情绪', '压力管理', '心态调整'],
        body_image: ['身材焦虑', '外貌困扰', '体重问题', '自我形象', '整容纠结'],
        addiction: ['游戏沉迷', '手机依赖', '网络成瘾', '熬夜习惯', '不良嗜好'],
        trauma: ['童年阴影', '情感创伤', '意外经历', '心理阴影', '创伤后应激'],
        other: []
    };
    return subcategories[category];
}
function getEmotionStyle(emotion) {
    const styles = {
        happy: {
            greeting: '看到你心情不错，真为你开心！😊',
            tone: '热情、积极、鼓励',
            color: '#FFD700',
            emoji: '😊'
        },
        sad: {
            greeting: '抱抱你，我在这里陪着你... 💝',
            tone: '温柔、安抚、共情',
            color: '#4A90D9',
            emoji: '😢'
        },
        anxious: {
            greeting: '我理解你的焦虑，让我们一起慢慢来... 🧘',
            tone: '耐心、沉稳、引导',
            color: '#FF9800',
            emoji: '😰'
        },
        angry: {
            greeting: '我感受到你的愤怒，先深呼吸，慢慢说... 🌬️',
            tone: '冷静、包容、倾听',
            color: '#F44336',
            emoji: '😠'
        },
        lonely: {
            greeting: '你不是一个人，我在这里倾听... 🌙',
            tone: '温暖、陪伴、支持',
            color: '#9C27B0',
            emoji: '🥺'
        },
        neutral: {
            greeting: '你好！很高兴能为你提供帮助。 👋',
            tone: '平和、专业、友好',
            color: '#607D8B',
            emoji: '🙂'
        },
        hopeful: {
            greeting: '看到你充满希望，真为你感到高兴！🌟',
            tone: '积极、鼓励、支持',
            color: '#4CAF50',
            emoji: '🌟'
        },
        confused: {
            greeting: '迷茫是成长的一部分，让我们一起梳理... 🧩',
            tone: '耐心、引导、分析',
            color: '#673AB7',
            emoji: '😕'
        },
        frustrated: {
            greeting: '我理解你的挫败感，这很正常... 💪',
            tone: '理解、鼓励、支持',
            color: '#FF5722',
            emoji: '😤'
        },
        guilty: {
            greeting: '每个人都会犯错，原谅自己也是一种成长... 🤍',
            tone: '宽容、接纳、安抚',
            color: '#E91E63',
            emoji: '😔'
        },
        shameful: {
            greeting: '不必感到羞愧，你值得被接纳... 🫂',
            tone: '包容、接纳、鼓励',
            color: '#9C27B0',
            emoji: '😳'
        },
        proud: {
            greeting: '为你感到骄傲！继续加油！🎉',
            tone: '肯定、鼓励、赞赏',
            color: '#FFC107',
            emoji: '😊'
        }
    };
    return styles[emotion];
}
const EMOTION_LABELS = {
    happy: '开心',
    sad: '低落',
    anxious: '焦虑',
    angry: '愤怒',
    lonely: '孤独',
    neutral: '平稳',
    hopeful: '充满希望',
    confused: '迷茫困惑',
    frustrated: '挫败',
    guilty: '内疚',
    shameful: '羞愧',
    proud: '自豪'
};
const RISK_LABELS = {
    low: '低',
    medium: '中',
    high: '高',
    critical: '严重'
};
function getEmotionLabel(emotion) {
    var _a;
    return (_a = EMOTION_LABELS[emotion]) !== null && _a !== void 0 ? _a : String(emotion);
}
function getRiskLabel(level) {
    var _a;
    return (_a = RISK_LABELS[level]) !== null && _a !== void 0 ? _a : String(level);
}
function getCategoryName(category) {
    const names = {
        academic_stress: '学业压力',
        interpersonal: '人际关系',
        family_relationship: '家庭关系',
        romantic_relationship: '恋爱关系',
        career_future: '职业未来',
        self_identity: '自我认同',
        emotion_regulation: '情绪调节',
        body_image: '身体意象',
        addiction: '成瘾问题',
        trauma: '创伤经历',
        other: '其他'
    };
    return names[category];
}
function formatEmotionReport(analysis, risk, problem, interventionName) {
    const secondaryEmotions = analysis.secondaryEmotions.length > 0
        ? analysis.secondaryEmotions.map(e => getEmotionLabel(e)).join('、')
        : '无';
    const lowConfNote = analysis.confidence < 0.45
        ? '\n（情绪置信度较低，以下分析仅供参考，建议结合专业评估。）'
        : '';
    return `【心理咨询报告】

一、情绪分析
- 当前情绪：${getEmotionLabel(analysis.emotion)}
- 置信度：${(analysis.confidence * 100).toFixed(0)}%${lowConfNote}
- 关键词：${analysis.keywords.length > 0 ? analysis.keywords.join('、') : '无'}
- 次要情绪：${secondaryEmotions}

二、问题分类
- 主要问题：${getCategoryName(problem.category)}
- 置信度：${(problem.confidence * 100).toFixed(0)}%
- 相关关键词：${problem.keywords.length > 0 ? problem.keywords.join('、') : '无'}
- 可能涉及：${problem.subcategories.length > 0 ? problem.subcategories.join('、') : '暂无'}

三、干预框架
- 推荐路径：${interventionName || '支持性心理咨询'}

四、风险评估
- 风险等级：${getRiskLabel(risk.level)}
- 预警关键词：${risk.keywords.length > 0 ? risk.keywords.join('、') : '无'}

${risk.warningMessage ? `五、重要提示
${risk.warningMessage}

📞 ${risk.hotline}` : ''}`;
}
