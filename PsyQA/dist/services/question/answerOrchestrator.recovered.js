"use strict";
const ruleEmotion = analyzeEmotion(fullText, priorEmotion);
const ruleRisk = assessRisk(fullText);
const ruleProblem = analyzeProblem(fullText);
if (ruleRisk.level === 'critical') {
    const metrics = refineMetricsWithSignals(ruleEmotion, ruleRisk, ruleProblem);
    const historySnapshots = getUserPsychSnapshots(userId);
    const statModel = buildPsychStatModel(ruleEmotion, ruleRisk, ruleProblem, metrics, historySnapshots);
    const intervention = getInterventionPlan(ruleEmotion.emotion, ruleProblem.category, ruleRisk.level);
    const carePlan = getCarePlanSuggestion(ruleProblem.category);
    const emotionStyle = getEmotionStyle(ruleEmotion.emotion);
    const psychSnapshot = buildPsychSnapshot(ruleEmotion, ruleRisk, ruleProblem, intervention.frameworkId, {
        emotion: 'rule',
        risk: 'rule',
        problem: 'rule'
    });
    const fullReport = buildFullReport(ruleEmotion, ruleRisk, ruleProblem, intervention.frameworkName, statModel);
    const priorityAnswer = `
⚠️ 我非常重视你现在的状态，你的安全是第一位的。

【安全计划 · 请按顺序完成】
1. 环境安全：远离可能伤害自己或他人的物品或场景
2. 当下冷静：离开冲突现场，深呼吸 10 次
3. 支持资源：联系辅导员/室友信任的同伴，并拨打 ${ruleRisk.hotline}
4. 如有受伤或持续冲突：拨打 120 / 110

你不是一个人。请先确保人身安全，再考虑沟通与和解。
${ETHICS_FOOTER}
    `.trim();
    const summary = generateSummary(question, priorityAnswer, psychSnapshot);
    const dialogId = saveDialog(userId, question, priorityAnswer, summary, psychSnapshot, fullReport);
    const portrait = enqueuePortrait(userId, dialogId, question, priorityAnswer, psychSnapshot, statModel, false);
    return {
        answer: priorityAnswer,
        knowledgeSources: [],
        similarQuestions,
        vectorDbResults: [],
        summary,
        emotion: ruleEmotion,
        risk: ruleRisk,
        problem: ruleProblem,
        emotionStyle,
        intervention: { frameworkId: intervention.frameworkId, frameworkName: intervention.frameworkName },
        carePlan: { categoryName: carePlan.categoryName, suggestion: carePlan.suggestion },
        analysisSources: { emotion: 'rule', risk: 'rule', problem: 'rule' },
        llmUsed: false,
        report: fullReport,
        statModel,
        modelUsed: 'Safety-Priority-Fast',
        responseTime: Date.now() - startTime,
        dialogId,
        portrait
    };
}
const useLlm = !loadTestFast && shouldUseOllamaLlm();
const ollamaOk = useLlm && (await isOllamaAvailable());
