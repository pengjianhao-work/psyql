/**
 * 咨询 Agent 工具注册表（元数据层）。
 *
 * 这里只描述工具的名字、给模型看的签名说明；真正的执行在
 * reactCounselAgent.executeTool 的 switch 里（需要 ReActPlan / ctx 这类
 * 运行时上下文）。新增工具时：
 * 1. 在这里加一条 ToolDef（name + signature）；
 * 2. TOOL_NAMES 自动包含它；
 * 3. 在 normalizeReActAction 里补关键词映射；
 * 4. 在 executeTool 里补 case；
 * 5. 同步 buildReActSystemPrompt 的说明（或改成由 defs 生成）。
 */

export interface ToolDef {
  name: string;
  /** 写进 system prompt 的一行说明，含 Action Input 示例 */
  signature: string;
}

export const COUNSEL_TOOL_DEFS: ToolDef[] = [
  {
    name: 'search_knowledge',
    signature: 'search_knowledge：检索公共心理知识库，Action Input: {"query":"检索词"}'
  },
  {
    name: 'search_user_memory',
    signature: 'search_user_memory：检索该用户历史咨询私有记忆，Action Input: {"query":"检索词"}'
  },
  {
    name: 'search_wiki',
    signature: 'search_wiki：按主题查已发布的内部知识页（学业、人际、情绪等），Action Input: {"query":"主题词"}'
  },
  {
    name: 'get_user_profile',
    signature: 'get_user_profile：查看该用户的累计咨询画像（困扰领域、常见情绪、反复主题），Action Input: {}'
  },
  {
    name: 'log_mood_checkin',
    signature:
      'log_mood_checkin：用户明确表达想记录当前心情时写入情绪打卡，Action Input: {"mood":"心情词","note":"可选备注"}'
  },
  {
    name: 'suggest_counseling_resource',
    signature:
      'suggest_counseling_resource：给出现实求助渠道（身边可信任的人、校内心理中心、心理援助热线），Action Input: {}'
  },
  {
    name: 'lookup_trend',
    signature:
      'lookup_trend：查询本周网络流行语/时事词条的解释（用户说了生僻梗或问热点时用），Action Input: {"query":"词或话题"}'
  },
  {
    name: 'reflect_psych',
    signature: 'reflect_psych：查看当前已融合的心理分析结论（无需参数），Action Input: {}'
  },
  {
    name: 'suggest_micro_training',
    signature:
      'suggest_micro_training：按情绪/议题建议 1～2 个微训练（高风险禁用），Action Input: {}'
  },
  {
    name: 'recommend_video',
    signature: 'recommend_video：按情绪推荐公开心理视频（危机/高风险禁用），Action Input: {}'
  },
  {
    name: 'finish',
    signature: 'finish：输出最终回复，Action Input: {"answer":"给用户的完整中文回复"}'
  }
];

export const TOOL_NAMES = COUNSEL_TOOL_DEFS.map((def) => def.name) as [
  string,
  ...string[]
];
