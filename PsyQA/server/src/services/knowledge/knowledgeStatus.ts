import * as fs from 'fs';
import { resolveDataFile } from '../../config/paths';
import { getKnowledgeBaseCount, loadKnowledgeBase } from './ragService';
import { getChromaStatus } from './chromaVectorService';

export interface KnowledgeEmbedStatus {
  knowledgeCount: number;
  datasetUpdatedAt?: string;
  datasetBytes?: number;
  chromaConnected: boolean;
  chromaCount?: number;
  embedReady: boolean;
}

export async function getKnowledgeEmbedStatus(): Promise<KnowledgeEmbedStatus> {
  if (getKnowledgeBaseCount() === 0) {
    try {
      loadKnowledgeBase();
    } catch {
      /* ignore */
    }
  }

  const knowledgeCount = getKnowledgeBaseCount();
  let datasetUpdatedAt: string | undefined;
  let datasetBytes: number | undefined;

  try {
    const dataPath = resolveDataFile('mental_dataset.json');
    const stat = fs.statSync(dataPath);
    datasetUpdatedAt = stat.mtime.toISOString();
    datasetBytes = stat.size;
  } catch {
    /* file missing */
  }

  const chroma = await getChromaStatus();
  const chromaCount = chroma.count ?? 0;
  const embedReady =
    knowledgeCount >= 100 && (chroma.connected ? chromaCount >= Math.min(knowledgeCount, 50) : true);

  return {
    knowledgeCount,
    datasetUpdatedAt,
    datasetBytes,
    chromaConnected: chroma.connected,
    chromaCount: chroma.connected ? chromaCount : undefined,
    embedReady
  };
}
