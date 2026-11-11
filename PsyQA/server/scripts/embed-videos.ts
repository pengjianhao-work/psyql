import '../src/config/env';
import { rebuildVideoEmbeddingIndex, VIDEO_EMBED_CACHE_PATH } from '../src/services/video/videoVectorService';

/**
 * 为视频库构建 bge-m3 向量索引并落盘。
 * 视频库内容变化后需要重新运行，否则运行时仍会用旧索引（hash 不一致时会自动重建）。
 */
async function main() {
  console.log('开始构建视频向量索引...');
  const { total, embedded, model } = await rebuildVideoEmbeddingIndex();
  console.log(`视频总数: ${total}`);
  console.log(`向量化成功: ${embedded}`);
  console.log(`使用模型: ${model}`);
  console.log(`索引文件: ${VIDEO_EMBED_CACHE_PATH}`);
  if (embedded < total) {
    console.warn(`有 ${total - embedded} 条未能向量化，这些视频不会参与相似度推荐`);
  }
}

main().catch((error) => {
  console.error('构建视频向量索引失败:', error instanceof Error ? error.message : error);
  process.exit(1);
});
