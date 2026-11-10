/**
 * 把待审核清单中 approved=true 的条目并入正式视频库
 * 运行: npm run videos:merge
 */
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'server/data');
const LIBRARY_PATH = path.join(DATA_DIR, 'psych_videos.json');
const PENDING_PATH = path.join(DATA_DIR, 'pending_videos.json');

interface VideoItemFile {
  id: string;
  title: string;
  author: string;
  url: string;
  tags: string[];
  emotions: string[];
  topics: string[];
  riskLevel: 'low' | 'medium' | 'high';
  description: string;
  durationSec?: number;
  isPlaceholder?: boolean;
}

interface PendingFile {
  generatedAt?: string;
  items?: Array<Omit<VideoItemFile, 'id'> & { approved?: boolean; source?: string }>;
}

function extractBvid(url: string): string {
  const match = url.match(/\/video\/(BV[0-9A-Za-z]+)/);
  return match ? match[1] : '';
}

function nextIdSeed(items: VideoItemFile[]): number {
  return items.reduce((max, item) => {
    const match = item.id.match(/^dv_(\d+)$/);
    if (!match) return max;
    return Math.max(max, Number(match[1]));
  }, 0);
}

function main(): void {
  if (!fs.existsSync(PENDING_PATH)) {
    console.error('未找到 pending_videos.json，请先运行: npm run videos:collect');
    process.exit(1);
  }

  const library = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8')) as VideoItemFile[];
  const pending = JSON.parse(fs.readFileSync(PENDING_PATH, 'utf8')) as PendingFile;
  const items = pending.items || [];
  const approved = items.filter((item) => item.approved === true);

  if (approved.length === 0) {
    console.log(`待审核清单共 ${items.length} 条，其中 approved=true 为 0 条，没有需要合并的内容。`);
    console.log('请打开 server/data/pending_videos.json，把要入库的条目改成 "approved": true 后重试。');
    return;
  }

  const existingBvids = new Set(library.map((item) => extractBvid(item.url || '')).filter(Boolean));
  let seed = nextIdSeed(library);
  let added = 0;
  let skipped = 0;

  approved.forEach((item) => {
    const bvid = extractBvid(item.url);
    if (bvid && existingBvids.has(bvid)) {
      skipped += 1;
      return;
    }
    seed += 1;
    const id = `dv_${String(seed).padStart(3, '0')}`;
    library.push({
      id,
      title: item.title,
      author: item.author,
      url: item.url,
      tags: item.tags,
      emotions: item.emotions,
      topics: item.topics,
      riskLevel: item.riskLevel || 'low',
      description: item.description,
      ...(item.durationSec ? { durationSec: item.durationSec } : {})
    });
    if (bvid) existingBvids.add(bvid);
    added += 1;
  });

  fs.writeFileSync(LIBRARY_PATH, `${JSON.stringify(library, null, 2)}\n`, 'utf8');

  const rest = items.filter((item) => item.approved !== true);
  fs.writeFileSync(
    PENDING_PATH,
    `${JSON.stringify({ ...pending, items: rest }, null, 2)}\n`,
    'utf8'
  );

  console.log(`已并入 ${added} 条，跳过重复 ${skipped} 条，视频库现有 ${library.length} 条。`);
  if (rest.length > 0) {
    console.log(`待审核清单剩余 ${rest.length} 条（approved=false，暂未入库）。`);
  }
}

try {
  main();
} catch (error) {
  console.error('合并失败:', error instanceof Error ? error.message : error);
  process.exit(1);
}
