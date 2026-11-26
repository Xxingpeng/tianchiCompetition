import type { Citation } from "./retrieval.ts";

// 这个系统提示随每次请求发送；历史由浏览器提供最近若干轮，服务端不保存会话。
export const AGENT_SYSTEM = [
  "你是「解剖智绘」网站的心脏学习助手，名叫「小医」，服务对象是医学生与对解剖感兴趣的公众。",
  "事实边界：只能使用用户消息里 [资料 n] 块内的事实，不得引入块外知识、不得编造数字、人名、研究或链接。资料不足时直接说「知识库暂无这部分内容」，并建议换个问法。",
  "引用：每个事实句后用 [n] 标注资料编号；编号只用于已给出的资料，禁止自造来源。只用与问题直接相关的资料，无关条目宁可不用，不要为凑引用而引用。",
  "推理：消息开头会给 [思考模式]。常规=先在内部按步骤核对资料再作答；深入=先在内部列出 2–3 种可能解释，逐一用资料检验，只保留有资料支持的结论。两种模式都只输出结论与依据，不输出推理草稿。",
  "页面事实：用户消息中的 [当前页面]/[当前切面]/[当前 CT 轴位] 是本站页面的真实状态，可直接引用；[当前切面] 的数字是 0 起索引，[当前 CT 轴位] 已换算成从 1 起的层号。只有用户明确问当前结构、切面或 CT 层时才使用这些页面事实，泛指心脏结构的问题不要主动提用户正在看什么，也不要把回答绑定到当前选中项。",
  "范围：只谈心脏解剖、心血管生理与 CT 阅片基础。遇到与个人症状、用药、手术、诊断相关的问题，不提供建议，提醒对方咨询医生；遇到无关话题，礼貌说明范围并引导回心脏学习。",
  "资料边界：资料能支持总体分类时先给出分类，再逐项用资料说明；只有确实没有资料覆盖的细项才说「知识库暂无这部分内容」，不要把已有资料能回答的部分说成没有。",
  "表达：中文，先给结论再给一两句解释，默认不超过 200 字；需要列举时用短列表。不使用表格，不使用表情。",
  "本站的切面、伪 CT 与 3D 是教学示意，不是真实病例影像，也不代表任何个体的检查结果；伪 CT 的逐层体素数是构建期真值，不是临床测量。被问到时要明确说明。",
].join("");

export type ReasoningMode = "cot" | "tot";

export function modeLabel(mode: ReasoningMode): string {
  return mode === "tot"
    ? "[思考模式] 深入（内部列出多种解释并逐一用资料检验，只输出结论与依据）"
    : "[思考模式] 常规（内部按步骤核对资料，只输出结论与依据）";
}

export interface AnswerRequestOptions {
  question: string;
  citations: readonly Citation[];
  mode: ReasoningMode;
  focusTitle?: string;
  focusDetail?: string;
  ctDetail?: string;
}

export function composeAnswerRequest({
  question,
  citations,
  mode,
  focusTitle,
  focusDetail,
  ctDetail,
}: AnswerRequestOptions): string {
  const blocks = citations.map(
    (citation) =>
      `[资料 ${citation.n}] ${citation.title} · ${citation.sourceName}\n${citation.text}`,
  );
  const parts = [modeLabel(mode), blocks.join("\n\n")];
  if (focusDetail) parts.push(`[当前切面]\n${focusDetail}`);
  else if (focusTitle) parts.push(`[当前页面] 用户正在查看结构：${focusTitle}`);
  if (ctDetail) parts.push(`[当前 CT 轴位]\n${ctDetail}`);
  parts.push(`[当前问题] ${question}`);
  return parts.join("\n\n");
}

// AI 通道失败时的兜底：直接给检索到的知识库原文，来源照常展示。
export function degradedAnswer(citations: readonly Citation[]): string {
  if (citations.length === 0) {
    return "AI 通道当前不可用，知识库也没有匹配到内容。可以稍后重试，或直接点左侧结构看三视图与详情。";
  }
  const picked = citations.slice(0, 2);
  const body = picked
    .map((citation) => `【${citation.title}】${citation.text} [${citation.n}]`)
    .join("\n\n");
  return `AI 通道当前不可用，先给出知识库中的相关条目原文：\n\n${body}\n\n以上为资料摘录，未做额外推断。`;
}
