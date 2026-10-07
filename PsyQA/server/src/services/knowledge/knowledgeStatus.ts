import * as fs from 'fs';
import { resolveDataFile } from '../../config/paths';
import { getKnowledgeBaseCount, loadKnowledgeBase } from './ragService';
import { getQdrantStatus } from './qdrantVectorService';

export interface KnowledgeEmbedStatus {
  knowledgeCount: number;
  datasetUpdatedAt?: string;
  datasetBytes?: number;
  chromaConnected: boolean;
  chromaCount?: number;
  qdrantConnected: boolean;
  qdrantCount?: number;
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

  const qdrant = await getQdrantStatus();
  const qdrantCount = qdrant.count ?? 0;
  const embedReady =
    knowledgeCount >= 100 && (qdrant.connected ? qdrantCount >= Math.min(knowledgeCount, 50) : true);

  return {
    knowledgeCount,
    datasetUpdatedAt,
    datasetBytes,
    chromaConnected: false,
    chromaCount: undefined,
    qdrantConnected: qdrant.connected,
    qdrantCount: qdrant.connected ? qdrantCount : undefined,
    embedReady
  };
}
