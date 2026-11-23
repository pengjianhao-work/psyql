import { closeDb, getDb } from '../db/database';
import {
  pickBottle,
  SEED_BOTTLES,
  throwBottle
} from '../services/social/driftBottleService';
import { collectUserSignals } from '../services/signals/userSignalService';
import * as schoolAlertService from '../services/school/schoolAlertService';

interface BottleRow {
  id: number;
  sender_id: string;
  body: string;
  mood_tag: string | null;
  status: string;
  created_at: string;
  picked_at: string | null;
  picked_by: string | null;
}

function bottleRows(): BottleRow[] {
  return getDb().prepare('SELECT * FROM drift_bottles').all() as BottleRow[];
}

describe('driftBottleService (SQLite)', () => {
  const sender = 'bottle_sender';
  const picker = 'bottle_picker';

  beforeAll(() => {
    process.env.PSYQA_DB_PATH = ':memory:';
    closeDb();
  });

  beforeEach(() => {
    closeDb();
    const db = getDb();
    db.prepare('DELETE FROM drift_bottles').run();
    db.prepare('DELETE FROM bottle_picks').run();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    closeDb();
    delete process.env.PSYQA_DB_PATH;
  });

  test('throwBottle stores a pooled bottle with mood tag', () => {
    const res = throwBottle(sender, { body: '今天有点想说话，写给陌生人', moodTag: '一般' });
    expect(res).toEqual({ ok: true, intercepted: false });
    const rows = bottleRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('pooled');
    expect(rows[0].mood_tag).toBe('一般');
    expect(rows[0].sender_id).toBe(sender);
  });

  test('validates body length and mood tag whitelist', () => {
    expect(() => throwBottle(sender, { body: '   ' })).toThrow('5–500');
    expect(() => throwBottle(sender, { body: '太短' })).toThrow('5–500');
    expect(() => throwBottle(sender, { body: '字'.repeat(600) })).toThrow('5–500');
    expect(() =>
      throwBottle(sender, { body: '一句足够长的话', moodTag: '开心到飞起' })
    ).toThrow('无效的心情标签');
    expect(bottleRows()).toHaveLength(0);
  });

  test('contact info is rejected and not stored', () => {
    expect(throwBottle(sender, { body: '联系我 13812345678 细聊吧' })).toEqual({
      ok: false,
      reason: 'contact_info'
    });
    expect(throwBottle(sender, { body: '看看这个 https://example.com 链接' })).toEqual({
      ok: false,
      reason: 'contact_info'
    });
    expect(bottleRows()).toHaveLength(0);
  });

  test('throw rate limit: 4th throw in a day is rejected', () => {
    expect(throwBottle(sender, { body: '第一个瓶子里的话' }).ok).toBe(true);
    expect(throwBottle(sender, { body: '第二个瓶子里的话' }).ok).toBe(true);
    expect(throwBottle(sender, { body: '第三个瓶子里的话' }).ok).toBe(true);
    expect(throwBottle(sender, { body: '第四个瓶子里的话' })).toEqual({
      ok: false,
      reason: 'rate_limited'
    });
    expect(bottleRows()).toHaveLength(3);
  });

  test('high-risk bottle is held, alerts professional channel, and returns care', () => {
    const alertSpy = jest
      .spyOn(schoolAlertService, 'recordRiskAlert')
      .mockReturnValue(null);

    const res = throwBottle(sender, { body: '我想死，觉得撑不下去了' });
    expect(res.ok).toBe(true);
    if (!res.ok || !res.intercepted) throw new Error('expected intercepted result');
    expect(res.intercepted).toBe(true);
    expect(res.care.message).toContain('没有丢进海里');
    expect(res.care.hotline).toContain('400-161-9995');

    const rows = bottleRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('held');

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: sender,
        riskLevel: 'critical',
        dialogId: `bottle_${rows[0].id}`
      })
    );
  });

  test('pickBottle excludes own bottles, marks picked, never leaks sender', () => {
    throwBottle(sender, { body: '海里的一句心里话呀', moodTag: '有点累' });

    const own = pickBottle(sender);
    expect(own.ok).toBe(true);
    if (own.ok) expect(own.bottle).toBeNull();

    const res = pickBottle(picker);
    expect(res.ok).toBe(true);
    if (!res.ok || !res.bottle) throw new Error('expected a bottle');
    expect(res.bottle.body).toBe('海里的一句心里话呀');
    expect(res.bottle.mood_tag).toBe('有点累');
    expect(res.bottle).not.toHaveProperty('sender_id');

    const rows = bottleRows();
    expect(rows[0].status).toBe('picked');
    expect(rows[0].picked_by).toBe(picker);
    expect(rows[0].picked_at).not.toBeNull();
  });

  test('held bottle is never pickable', () => {
    jest.spyOn(schoolAlertService, 'recordRiskAlert').mockReturnValue(null);
    throwBottle(sender, { body: '我想死，觉得撑不下去了' });

    const res = pickBottle(picker);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.bottle).toBeNull();
      expect(res.seed).toBeDefined();
      if (res.seed) expect(SEED_BOTTLES).toContain(res.seed.text);
    }
    expect(bottleRows()[0].status).toBe('held');
  });

  test('pick falls back to a seed bottle when pool is empty', () => {
    const res = pickBottle(picker);
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');
    expect(res.bottle).toBeNull();
    expect(res.seed).toBeDefined();
    expect(SEED_BOTTLES).toContain(res.seed!.text);
  });

  test('pick rate limit counts attempts including seed fallbacks', () => {
    for (let i = 0; i < 5; i += 1) {
      expect(pickBottle(picker).ok).toBe(true);
    }
    expect(pickBottle(picker)).toEqual({ ok: false, reason: 'rate_limited' });
  });

  test('contact-info bottle in pool is skipped at pick time', () => {
    // 直接写库，模拟绕过扔出过滤的脏数据
    getDb()
      .prepare(
        "INSERT INTO drift_bottles(sender_id, body, mood_tag, status, created_at) VALUES(?, ?, NULL, 'pooled', ?)"
      )
      .run(sender, '加我 13812345678 吧', new Date().toISOString());
    throwBottle(sender, { body: '一只干净的瓶子里的话' });

    const res = pickBottle(picker);
    expect(res.ok).toBe(true);
    if (!res.ok || !res.bottle) throw new Error('expected clean bottle');
    expect(res.bottle.body).toBe('一只干净的瓶子里的话');

    const rows = bottleRows();
    const dirty = rows.find((r) => r.body.includes('13812345678'))!;
    expect(dirty.status).toBe('pooled');
  });

  test('signal collector sees pooled/picked bottles but not held ones', () => {
    const alertSpy = jest
      .spyOn(schoolAlertService, 'recordRiskAlert')
      .mockReturnValue(null);

    throwBottle(sender, { body: '今天把心事丢进了海里' });
    throwBottle(sender, { body: '我想死，觉得撑不下去了' });

    const signals = collectUserSignals(sender, { types: ['bottle'] });
    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe('bottle');
    expect(signals[0].text).toBe('漂流瓶：今天把心事丢进了海里');

    alertSpy.mockRestore();
  });
});
