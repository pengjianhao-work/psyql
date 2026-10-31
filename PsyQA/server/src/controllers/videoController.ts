import { Request, Response } from 'express';
import { listVideos } from '../services/video/videoRecommendationService';

export const getVideoLibrary = (req: Request, res: Response): void => {
  const emotion = String(req.query.emotion || '').trim();
  const topic = String(req.query.topic || '').trim();
  const keyword = String(req.query.q || '').trim();

  const rawLimit = Number(req.query.limit);
  const limit = Number.isFinite(rawLimit) ? Math.trunc(rawLimit) : 20;

  const videos = listVideos({ emotion, topic, keyword, limit });
  res.json({ total: videos.length, videos });
};
