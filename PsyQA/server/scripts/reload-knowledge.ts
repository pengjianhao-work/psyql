/**
 * 热加载知识库与向量库（扩充数据后执行，无需重启进程时可用）
 * 运行: npm run reload:knowledge
 */
import { reloadKnowledgeBase } from '../src/services/ragService';
import { reloadVectorDatabase } from '../src/services/vectorDBService';

const kb = reloadKnowledgeBase();
const vec = reloadVectorDatabase();
console.log(`知识库已重载: ${kb} 条 | 向量库: ${vec} 条`);
