"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const loraModelRegistry_1 = require("../services/llm/loraModelRegistry");
describe('loraModelRegistry', () => {
    it('pickOllamaModelFromTags prefers psyqa-counsel when PSYQA_PREFER_LORA=1', () => {
        const prev = process.env.PSYQA_PREFER_LORA;
        process.env.PSYQA_PREFER_LORA = '1';
        const tags = ['qwen:7b', 'psyqa-counsel:latest', 'nomic-embed-text'];
        const picked = (0, loraModelRegistry_1.pickOllamaModelFromTags)(tags);
        expect(picked.fineTuned).toBe(true);
        expect(picked.model).toContain('psyqa-counsel');
        if (prev === undefined)
            delete process.env.PSYQA_PREFER_LORA;
        else
            process.env.PSYQA_PREFER_LORA = prev;
    });
    it('getConfiguredLoraModelName defaults to psyqa-counsel', () => {
        const prev = process.env.PSYQA_LORA_MODEL;
        delete process.env.PSYQA_LORA_MODEL;
        expect((0, loraModelRegistry_1.getConfiguredLoraModelName)()).toBe('psyqa-counsel');
        if (prev === undefined)
            delete process.env.PSYQA_LORA_MODEL;
        else
            process.env.PSYQA_LORA_MODEL = prev;
    });
});
