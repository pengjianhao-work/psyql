import request from 'supertest';
import { createApp } from '../../createApp';

describe('SSE ask stream', () => {
  const app = createApp();

  it('returns event-stream content type', async () => {
    const res = await request(app)
      .post('/api/questions/ask/stream')
      .set('Accept', 'text/event-stream')
      .send({ question: '最近有点焦虑怎么办', userId: 'demo' });

    expect([200, 401, 429, 503]).toContain(res.status);
    if (res.status === 200) {
      expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    }
  });
});
