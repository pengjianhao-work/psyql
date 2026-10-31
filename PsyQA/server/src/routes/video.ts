import { Router } from 'express';
import { getVideoLibrary } from '../controllers/videoController';

export const videoRouter = Router();

videoRouter.get('/', getVideoLibrary);
