/**
 * 旧的整句向量同步会覆盖混合集合，因此停用。
 * 重建：npm run reindex:bge-m3
 * 查询编码：npm run start:bge-m3
 */
console.error('整句向量同步已停用。混合索引用 npm run reindex:bge-m3，查询服务用 npm run start:bge-m3。');
process.exit(1);
