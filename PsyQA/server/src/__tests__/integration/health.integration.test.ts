import request from 'supertest';
import { createApp } from '../../createApp';

describe('HTTP integration', () => {
  const app = createApp();
  jest.setTimeout(15000);

  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('llmMode');
  });

  it('GET /ready returns ready', async () => {
    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
  });

  it('GET /api/v1 mount mirrors /api', async () => {
    const res = await request(app).get('/api/v1/questions/categories');
    expect([200, 401, 403]).toContain(res.status);
  });
});
