import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { callLlmGenerate, resolveLlmMode, getLastActiveLlmProvider } from '../src/services/llmClient';
import { callZhipuGenerate } from '../src/services/zhipuClient';

async function main(): Promise<void> {
  console.log('ZHIPU_MODEL=', process.env.ZHIPU_MODEL);
  console.log('ZHIPU configured=', Boolean(process.env.ZHIPU_API_KEY));

  const mode = await resolveLlmMode(true);
  console.log('resolveLlmMode=', mode);

  console.log('\n--- direct zhipu (current model) ---');
  const direct = await callZhipuGenerate('用一句话说你好', { maxTokens: 32, timeoutMs: 60000 });
  console.log('direct reply:', direct || '(null)');

  console.log('\n--- callLlmGenerate (zhipu -> ollama fallback) ---');
  const reply = await callLlmGenerate('请用一句话安慰感到考试焦虑的大学生', {
    temperature: 0.4,
    maxTokens: 120,
    timeoutMs: 90000
  });
  console.log('reply:', reply || '(null)');
  console.log('active provider:', getLastActiveLlmProvider());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
