/**
 * 瓒嬪娍璇嶆潯瀛樺偍涓庢煡璇細trend_terms 琛ㄧ殑璇诲啓銆佸懆婊氬姩銆佹牸寮忓寲銆?
 * 鏁版嵁鐢?scripts/build-trend-digest.ts 姣忓懆鐢熸垚锛岃繖閲屽彧璐熻矗瀛樺彇銆?
 */
import { getDb } from '../../db/database';

export interface TrendTerm {
  id: number;
  term: string;
  kind: 'slang' | 'event' | string;
  explanation: string;
  example: string | null;
  source: string | null;
  week_key: string;
  heat: number;
  status: string;
}

/** ISO 鍛ㄩ敭锛屽 2026-W46 */
export function currentWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export interface ExtractedTerm {
  term: string;
  kind?: string;
  explanation?: string;
  example?: string;
  source?: string;
  heat?: number;
}

/** 鍐欏叆鏈懆璇嶆潯锛氬悓 term+kind 鍚堝苟鏇存柊锛屽叾浣欐爣璁颁负杩囨湡锛堜繚鐣?4 鍛ㄥ彲鍥炴煡锛夈€?*/
export function saveTrendTerms(terms: ExtractedTerm[], weekKey = currentWeekKey()): number {
  const db = getDb();
  const now = new Date().toISOString();
  const upsert = db.prepare(
    `INSERT INTO trend_terms (term, kind, explanation, example, source, week_key, heat, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
     ON CONFLICT(term, kind) DO UPDATE SET
       explanation = excluded.explanation,
       example = COALESCE(excluded.example, trend_terms.example),
       source = COALESCE(excluded.source, trend_terms.source),
       week_key = excluded.week_key,
       heat = MAX(trend_terms.heat, excluded.heat),
       status = 'active',
       updated_at = excluded.updated_at`
  );
  const tx = db.transaction((items: ExtractedTerm[]) => {
    for (const item of items) {
      const term = String(item.term || '').trim().slice(0, 60);
      if (!term) continue;
      upsert.run(
        term,
        item.kind === 'slang' ? 'slang' : 'event',
        String(item.explanation || '').trim().slice(0, 200),
        item.example ? String(item.example).trim().slice(0, 200) : null,
        item.source ?? null,
        weekKey,
        Math.max(0, Math.round(item.heat ?? 0)),
        now,
        now
      );
    }
    // 4 鍛ㄦ病鍐嶅嚭鐜扮殑璇嶆潯褰掓。锛屾敞鍏ュ拰鏌ヨ鍙湅 active
    const cutoff = new Date(Date.now() - 28 * 86400000).toISOString();
    db.prepare(`UPDATE trend_terms SET status = 'archived' WHERE status = 'active' AND updated_at < ?`).run(cutoff);
  });
  tx(terms);
  return terms.length;
}

/** 褰撳墠鏈夋晥璇嶆潯锛氫紭鍏堟湰鍛紝鎸夌儹搴︽帓搴忋€?*/
export function listActiveTrendTerms(limit = 8): TrendTerm[] {
  const db = getDb();
  const weekKey = currentWeekKey();
  return db
    .prepare(
      `SELECT * FROM trend_terms
       WHERE status = 'active'
       ORDER BY (week_key = ?) DESC, heat DESC, updated_at DESC
       LIMIT ?`
    )
    .all(weekKey, limit) as TrendTerm[];
}

/** prompt 娉ㄥ叆鐢細涓€琛屼竴鏉★紝鎺у埗鍦?~200 瀛椾互鍐呫€?*/
export function formatTrendContext(terms: TrendTerm[]): string {
  if (!terms.length) return '';
  const lines = terms
    .slice(0, 8)
    .map((t) => `路 ${t.term}锛?{t.kind === 'slang' ? '娴佽璇? : '鏃朵簨'}锛夛細${t.explanation}`)
    .join('\n');
  return `鏈懆鏍″洯/缃戠粶鐑偣锛堜粎渚涗綘鐞嗚В璇锛屼笉瑕佺収鎼杩帮級锛歕n${lines}`;
}

/** Agent 宸ュ叿 lookup_trend 鐢細鎸夎瘝/璇濋妯＄硦鍖归厤銆?*/
export function lookupTrend(query: string, limit = 5): TrendTerm[] {
  const q = query.trim();
  if (!q) return [];
  const db = getDb();
  const like = `%${q.replace(/[%_]/g, '')}%`;
  return db
    .prepare(
      `SELECT * FROM trend_terms
       WHERE status = 'active' AND (term LIKE ? OR explanation LIKE ?)
       ORDER BY heat DESC, updated_at DESC
       LIMIT ?`
    )
    .all(like, like, limit) as TrendTerm[];
}
