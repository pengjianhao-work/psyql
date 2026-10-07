import { resolveEmbedRoutes } from '../services/knowledge/embeddingService';

describe('resolveEmbedRoutes', () => {
  const keys = [
    'PSYQA_EMBED_PROVIDER',
    'SILICONFLOW_EMBED_MODEL',
    'OLLAMA_EMBED_MODEL',
    'ZHIPU_API_KEY',
    'ZHIPU_API_URL',
    'SILICONFLOW_API_KEY',
    'SILICONFLOW_API_URL',
    'QIANFAN_API_KEY',
    'QIANFAN_API_URL'
  ] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of keys) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('uses only Ollama when provider is ollama', () => {
    process.env.PSYQA_EMBED_PROVIDER = 'ollama';
    process.env.OLLAMA_EMBED_MODEL = 'bge-m3';
    expect(resolveEmbedRoutes()).toEqual([{ provider: 'ollama', model: 'bge-m3' }]);
  });

  it('uses only SiliconFlow when provider is siliconflow', () => {
    process.env.PSYQA_EMBED_PROVIDER = 'siliconflow';
    expect(resolveEmbedRoutes()).toEqual([{ provider: 'siliconflow', model: 'BAAI/bge-m3' }]);
  });

  it('tries SiliconFlow then Ollama in auto mode when a SiliconFlow key is set', () => {
    process.env.PSYQA_EMBED_PROVIDER = 'auto';
    process.env.ZHIPU_API_KEY = 'sk-test-key-12345678';
    process.env.ZHIPU_API_URL = 'https://api.siliconflow.cn/v1';
    process.env.OLLAMA_EMBED_MODEL = 'bge-m3';
    expect(resolveEmbedRoutes()).toEqual([
      { provider: 'siliconflow', model: 'BAAI/bge-m3' },
      { provider: 'ollama', model: 'bge-m3' }
    ]);
  });

  it('uses only Ollama in auto mode without a cloud embedding endpoint', () => {
    process.env.PSYQA_EMBED_PROVIDER = 'auto';
    expect(resolveEmbedRoutes()).toEqual([{ provider: 'ollama', model: 'bge-m3' }]);
  });
});
