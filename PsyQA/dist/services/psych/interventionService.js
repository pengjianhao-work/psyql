"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HIGH_RISK_CLARIFICATION = exports.ETHICS_FOOTER = void 0;
exports.getInterventionPlan = getInterventionPlan;
const EMOTION_PHRASES = {
    sad: {
        open: '我能感受到你现在心里很重，这种难过被看见本身就有意义。',
        close: '你不用一个人扛，今天可以先做一件很小、但能让自己稍微松一口气的事。'
    },
    anxious: {
        open: '焦虑来的时候，身体往往比脑子更先报警，我们先不急着解决一切。',
        close: '把步子缩小，完成一小步就值得肯定，我会继续陪你梳理。'
    },
    angry: {
        open: '你有权利感到生气，我们先不评判对错，先把情绪安放一下。',
        close: '等你稍微平静一点，我们再一起看：什么边界需要被说清楚。'
    },
    lonely: {
        open: '孤独感很真实，也并不代表你不够好或不被需要。',
        close: '若愿意，今天试着给一位你信任的人发一句简单的问候。'
    },
    frustrated: {
        open: '挫败感说明你在乎这件事，这本身也是一种力量。',
        close: '把目标拆到「今天能完成」的粒度，会比逼自己一下子变好更有效。'
    },
    guilty: {
        open: '内疚常常来自你很在意关系或责任，我们可以一起看看哪些自责超出了合理范围。',
        close: '对自己宽容一点，不等于逃避责任，而是为了能更可持续地前行。'
    },
    confused: {
        open: '迷茫不代表你不行，很多时候只是选择太多、信息太杂。',
        close: '先写下你最在意的 1 个目标，我们再倒推下一步。'
    },
    neutral: {
        open: '谢谢你愿意把这些讲出来，我们慢慢理。',
        close: '有任何新的感受或变化，都可以继续告诉我。'
    }
};
const DEFAULT_PHRASE = {
    open: '谢谢你信任我，愿意说出这些。',
    close: '你已经在照顾自己了，我们一步一步来。'
};
function pickPhrase(emotion) {
    var _a;
    return (_a = EMOTION_PHRASES[emotion]) !== null && _a !== void 0 ? _a : DEFAULT_PHRASE;
}
function getInterventionPlan(emotion, problem, risk) {
    var _a, _b;
    const phrases = pickPhrase(emotion);
    if (risk === 'critical') {
        return {
            frameworkId: 'safety_plan',
            frameworkName: '安全计划（危机优先）',
            structureHint: [
                '① 确认当下安全与环境（远离危险物品）',
                '② 触发因素：最近什么情境让痛苦加剧',
                '③ 应对策略：此刻可做的 2 个具体安抚动作',
                '④ 支持人：可立即联系的人及热线',
                '禁止展开原因分析或哲学讨论，只给可执行安全步骤'
            ].join('\n'),
            openingPhrase: '我非常在意你现在的安全，我们先确保你此刻是安全的。',
            closingPhrase: '请优先联系现实中的人或拨打心理援助热线，你值得被帮助。'
        };
    }
    const key = `${emotion}:${problem}`;
    const table = {
        'anxious:academic_stress': {
            frameworkId: 'cbt_academic',
            frameworkName: 'CBT 轻度 · 学业焦虑',
            structureHint: '① 情绪命名 ② 识别 1 条自动化思维（如「我肯定考砸」）③ 小实验：25 分钟专注 + 5 分钟休息 ④ 今晚 1 个可完成的小任务'
        },
        'sad:interpersonal': {
            frameworkId: 'interpersonal_activation',
            frameworkName: '人际支持 + 行为激活',
            structureHint: '① 共情孤独/失落 ② 记录 1 次真实互动（哪怕很短）③ 设计 1 个微小社交行动（问候/共进餐）'
        },
        'angry:family_relationship': {
            frameworkId: 'emotion_boundary',
            frameworkName: '情绪调节 + 边界',
            structureHint: '① 身体放松（呼吸/走动 3 分钟）② 「我信息」表达模板 ③ 是否需要第三方（辅导员/咨询师）协助沟通'
        },
        'anxious:career_future': {
            frameworkId: 'mi_future',
            frameworkName: '动机访谈 · 未来迷茫',
            structureHint: '① 探索「我最在乎的 3 件事」② 利弊权衡 ③ 本周 1 个探索性行动（了解职业/访谈学长）'
        },
        'sad:emotion_regulation': {
            frameworkId: 'mindfulness_light',
            frameworkName: '正念轻量 · 情绪调节',
            structureHint: '① 情绪命名 ② 5-4-3-2-1  grounding ③ 自我关怀一句（像对好友说话）'
        }
    };
    const fallbackByProblem = {
        academic_stress: {
            frameworkId: 'cbt_general',
            frameworkName: 'CBT 通用 · 压力管理',
            structureHint: '① 共情 ② 区分可控/不可控 ③ 3 步行动清单（今天就能开始）'
        },
        interpersonal: {
            frameworkId: 'interpersonal_general',
            frameworkName: '人际沟通通用',
            structureHint: '① 共情 ② 澄清期待与边界 ③ 1 次具体沟通练习'
        },
        emotion_regulation: {
            frameworkId: 'mindfulness_general',
            frameworkName: '正念与情绪调节',
            structureHint: '① 情绪命名 ② 身体信号 ③ 一个 5 分钟内可完成的调节动作'
        }
    };
    const picked = (_b = (_a = table[key]) !== null && _a !== void 0 ? _a : fallbackByProblem[problem]) !== null && _b !== void 0 ? _b : {
        frameworkId: 'supportive_counseling',
        frameworkName: '支持性心理咨询',
        structureHint: '① 共情 ② 梳理困扰 ③ 可执行建议 ④ 简短鼓励'
    };
    return Object.assign(Object.assign({}, picked), { openingPhrase: phrases.open, closingPhrase: phrases.close });
}
exports.ETHICS_FOOTER = '\n\n---\n【重要说明】以上内容为心理支持与自助建议，不能替代医疗诊断或治疗。若感到难以承受或出现自伤/伤人想法，请立即联系身边人并拨打 120 / 心理援助热线。';
exports.HIGH_RISK_CLARIFICATION = '在继续之前，我想确认：你刚才提到的困扰，是否包含伤害自己或他人的具体计划？若有，请优先联系可信任的人或拨打心理援助热线。';
