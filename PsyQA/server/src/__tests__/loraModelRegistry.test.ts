import { pickOllamaModelFromTags, getConfiguredLoraModelName } from '../services/llm/loraModelRegistry';

describe('loraModelRegistry', () => {
  it('pickOllamaModelFromTags prefers psyqa-counsel when PSYQA_PREFER_LORA=1', () => {
    const prev = process.env.PSYQA_PREFER_LORA;
    process.env.PSYQA_PREFER_LORA = '1';
    const tags = ['qwen:7b', 'psyqa-counsel:latest', 'nomic-embed-text'];
    const picked = pickOllamaModelFromTags(tags);
    expect(picked.fineTuned).toBe(true);
    expect(picked.model).toContain('psyqa-counsel');
    if (prev === undefined) delete process.env.PSYQA_PREFER_LORA;
    else process.env.PSYQA_PREFER_LORA = prev;
  });

  it('getConfiguredLoraModelName defaults to psyqa-counsel', () => {
    const prev = process.env.PSYQA_LORA_MODEL;
    delete process.env.PSYQA_LORA_MODEL;
    expect(getConfiguredLoraModelName()).toBe('psyqa-counsel');
    if (prev === undefined) delete process.env.PSYQA_LORA_MODEL;
    else process.env.PSYQA_LORA_MODEL = prev;
  });
});
