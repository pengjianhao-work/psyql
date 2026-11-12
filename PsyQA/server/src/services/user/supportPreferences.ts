const options = (entries: Record<string, string>) =>
  Object.entries(entries).map(([id, label]) => ({ id, label }));

const openings = {
  listen: '「好几件事一起压过来，确实挺累的。你愿意从最让你难受的那件说起吗？」',
  clarify: '「我们先把这几件事分开看看。哪件有明确的截止时间，哪件最占你的心思？」',
  action: '「先花一分钟，把最挂心的三件事写下来。我们从其中一件开始。」',
  ask: '看当天的状态，先问问我想怎么聊。'
};

export const supportQuestions = [
  { id: 'opening', title: '1. 如果你说「最近事情太多，我有点撑不住了」，你最希望先听到哪一句？', max: 1, options: options(openings) },
  { id: 'overwhelmed', title: '2. 当你已经很烦、没什么精力时，希望我们怎么聊？', max: 1, options: options({
    listen: '放慢一点，先听我说，等我准备好了再给建议。',
    clarify: '帮我抓住重点，一次只问我一个问题。',
    action: '给我一个不用想太多、现在就能做的小动作。',
    ask: '先问我今天更想要哪种帮助。'
  }) },
  { id: 'tone', title: '3a. 平时你更喜欢怎样的语气？', max: 1, options: options({
    gentle: '温和一点', plain: '自然、平实一点', direct: '直接一点', any: '都可以'
  }) },
  { id: 'length', title: '3b. 平时你更喜欢多长的回答？', max: 1, options: options({
    short: '两三句话先讲重点', bullets: '用几个要点说明', detailed: '可以多解释一点', any: '都可以'
  }) },
  { id: 'content', title: '4. 当你拿不定主意时，什么内容最能帮你想清楚？', max: 2, options: options({
    facts: '把事实、猜测和我能控制的部分分开。',
    values: '想清楚我最在乎什么，以及这个决定会怎样影响我和别人。',
    tradeoffs: '列出两三个可行选项，说说各自的利弊。',
    example: '举一个贴近我处境的例子，让我看看可以怎么做。',
    listen: '先陪我聊聊，等我想清楚自己在纠结什么。'
  }) },
  { id: 'goal', title: '5. 回想过去一周，你最想让哪个时刻变得轻松一点？', max: 1, options: options({
    stress: '事情堆在一起，不知道先处理哪件。',
    breathing: '突然紧张起来，想先让自己缓一缓。',
    sleep: '睡前脑子还在转，很难放松。',
    focus: '想开始学习或做事，却迟迟进不了状态。',
    cbt: '一件事过去了，还是反复想、容易责怪自己。',
    communication: '有话想说，却不知道怎么开口。',
    any: '暂时没有特别想改善的，先看看有哪些练习。'
  }) },
  { id: 'format', title: '6. 如果现在做个小练习，你更愿意从哪里开始？', max: 2, options: options({
    relax: '跟着提示慢慢呼吸、放松一下。',
    write: '写几句话，把感受或事情理一理。',
    action: '挑一个小动作，做了就能往前一点。',
    example: '跟着一个例子练习，比如试着说出一句我想说的话。',
    any: '都可以，按我当下的情况推荐。'
  }) },
  { id: 'minutes', title: '7. 一次练习做多久，对你来说比较容易开始？', max: 1, options: options({
    '3': '3 分钟以内', '5': '4–5 分钟', '6': '6 分钟左右也可以', any: '看当天的安排'
  }) }
] as const;

export type SupportAnswers = Partial<Record<typeof supportQuestions[number]['id'], string[]>>;

export function parseSupportAnswers(input: unknown): SupportAnswers | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const answers: SupportAnswers = {};
  for (const [key, values] of Object.entries(input)) {
    const question = supportQuestions.find((item) => item.id === key);
    if (!question || !Array.isArray(values) || values.length > question.max ||
        new Set(values).size !== values.length || (values.includes('any') && values.length > 1) ||
        !values.every((value) => question.options.some((option) => option.id === value))) return null;
    if (values.length) answers[question.id] = values;
  }
  return answers;
}

export function buildSupportReplyGuidance(input: unknown): string {
  const answers = parseSupportAnswers(input);
  if (!answers) return '';
  const openingGuidance: Record<string, string> = {
    listen: '先回应感受、邀请用户继续说，等用户准备好再给建议',
    clarify: '先梳理困扰、抓住重点，一次只问一个问题',
    action: '先给一个简单、现在就能做的小步骤',
    ask: '先问用户此刻更想被倾听、梳理问题还是尝试一个小步骤'
  };
  const rules: string[] = [];
  if (answers.opening) rules.push(`默认开场：${openingGuidance[answers.opening[0]]}。`);
  if (answers.overwhelmed) rules.push(`用户明确表示很累、很烦或精力不足时，优先这样开场：${openingGuidance[answers.overwhelmed[0]]}。`);
  for (const [key, title] of [['tone', '语气'], ['length', '篇幅'], ['content', '内容形式'], ['goal', '近期目标']] as const) {
    const labels = supportQuestions.find((item) => item.id === key)?.options
      .filter((option) => option.id !== 'any' && answers[key]?.includes(option.id))
      .map((option) => option.label);
    if (labels?.length) rules.push(`${title}：${labels.join(' ')}。`);
  }
  if (!rules.length) return '';
  return ['【用户主动设置的回复偏好】', ...rules,
    '当前对话的明确要求优先于问卷。按照适用的偏好调整默认开场、语气、篇幅与结构；近期目标仅在与当前话题相关时使用。安全和危机处理要求始终优先。'].join('\n');
}
