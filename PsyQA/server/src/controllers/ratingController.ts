import { Request, Response } from 'express';
import { updateDialogSelfRating, getUserPsychSnapshots } from '../services/common/historyManager';
import { rebuildStatModelFromSnapshot } from '../services/psych/psychStatsService';

export const postSelfRating = (req: Request, res: Response): void => {
  const { userId, dialogTime, moodRating, stressRating, anxietyRating } = req.body as {
    userId?: string;
    dialogTime?: string;
    moodRating?: number;
    stressRating?: number;
    anxietyRating?: number;
  };

  const uid = String(userId || 'default_user').trim();
  const time = dialogTime ? String(dialogTime) : undefined;

  const mood = clampRating(moodRating);
  const stress = clampRating(stressRating);
  const anxiety = clampRating(anxietyRating);

  if (mood === undefined && stress === undefined && anxiety === undefined) {
    res.status(400).json({ error: '请至少提供 moodRating、stressRating 或 anxietyRating 之一（1-10）' });
    return;
  }

  const updated = updateDialogSelfRating(uid, time, {
    userSelfRating: mood,
    selfRatedStress: stress,
    selfRatedAnxiety: anxiety
  });

  if (!updated) {
    res.status(404).json({ error: '未找到可更新的咨询记录，请先完成一次对话' });
    return;
  }

  const allSnapshots = getUserPsychSnapshots(uid);
  const history = allSnapshots.slice(0, -1);
  const statModel = rebuildStatModelFromSnapshot(updated, history);

  res.json({
    message: '自评已保存，报告已更新',
    psych: updated,
    statModel
  });
};

function clampRating(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(10, Math.max(1, Math.round(n)));
}
