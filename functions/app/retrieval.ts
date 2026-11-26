import type { Topic } from "./intent.ts";
import { tokenize } from "./text.ts";

export interface SourceMeta {
  name: string;
  url: string;
  license: string;
  publisher: string;
}

export interface KnowledgeChunk {
  id: string;
  topic: Topic;
  title: string;
  source: string;
  section?: string;
  keywords: string[];
  text: string;
}

export interface KnowledgeBase {
  version: number;
  builtAt: string;
  note?: string;
  sources: Record<string, SourceMeta>;
  chunks: KnowledgeChunk[];
}

export interface Citation {
  n: number;
  id: string;
  title: string;
  text: string;
  sourceName: string;
  url: string;
  license: string;
}

export interface RetrievalResult {
  citations: Citation[];
  bestScore: number;
}

const K1 = 1.2;
const B = 0.75;
const ANATOMY_TOPICS: ReadonlySet<Topic> = new Set(["anatomy"]);
const CT_TOPICS: ReadonlySet<Topic> = new Set(["ct", "anatomy"]);

interface IndexedChunk {
  chunk: KnowledgeChunk;
  length: number;
  frequencies: Map<string, number>;
}

// 中文单字（的/学/心）在 22 条资料里几乎处处出现，只会把无关查询拉过阈值；
// 索引与查询都只用双字及以上的中文词元与完整拉丁词。"脏的""的瓣"这类
// 跨词虚词双字同样没有检索意义，一并丢掉。
const PARTICLES = /[的了吗呢吧啊呀哦嘛]/;
const FUNCTION_CHARS = /[是有和与在为对从到把被用作个这那么哪怎如何请告诉讲说想看能会要需]/;

function usable(token: string): boolean {
  if (PARTICLES.test(token) || FUNCTION_CHARS.test(token)) return false;
  return /^[a-z0-9]+$/.test(token) ? token.length >= 2 : [...token].length >= 2;
}

// 疑问词与客套词几乎出现在每个条目标题里（"是什么""为什么"），只会把
// "窗宽窗位是什么"拉向心耳、心肌这类无关条目；查询侧直接丢弃。
const QUERY_STOPWORDS = new Set([
  "什么",
  "为什",
  "是什",
  "怎么",
  "如何",
  "哪些",
  "哪个",
  "为何",
  "是否",
  "多少",
  "这个",
  "那个",
  "可以",
  "一下",
  "请问",
  "介绍",
  "解释",
  "讲讲",
  "告诉",
  "作用",
  "有哪",
  "各自",
  "分别",
]);

function indexChunk(chunk: KnowledgeChunk): IndexedChunk {
  // 标题与关键词是人工挑的强信号，重复计入以抬高权重。
  const tokens = [
    ...tokenize(chunk.title),
    ...tokenize(chunk.title),
    ...tokenize(chunk.title),
    ...chunk.keywords.flatMap((keyword) => tokenize(keyword)),
    ...chunk.keywords.flatMap((keyword) => tokenize(keyword)),
    ...tokenize(chunk.text),
  ].filter(usable);
  const frequencies = new Map<string, number>();
  for (const token of tokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  return { chunk, length: tokens.length, frequencies };
}

export function createRetriever(
  kb: KnowledgeBase,
  options: { k?: number; minScore?: number } = {},
): (query: string, topic?: Topic) => RetrievalResult {
  const k = options.k ?? 4;
  // 语料只有 23 条，2.1 分以下基本只命中"心脏/心室"这类通用词；宁可少给资料，
  // 也不让无关来源稀释引用可信度，真要没命中就走"资料不足"的诚实回复。
  const minScore = options.minScore ?? 2.1;
  const docs: IndexedChunk[] = [];
  for (const chunk of kb.chunks) {
    if (!kb.sources[chunk.source]) continue;
    docs.push(indexChunk(chunk));
  }
  const documentFrequency = new Map<string, number>();
  for (const doc of docs) {
    for (const token of doc.frequencies.keys()) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }
  const total = docs.length;
  const averageLength = docs.reduce((sum, doc) => sum + doc.length, 0) / Math.max(total, 1);

  return (query: string, topic?: Topic) => {
    // 意图已判定主题时按主题收窄候选：解剖题不再混进站内目录/CT 条目，
    // CT 题仍保留解剖条目作为看图基础。重量级排序不变。
    const allowed = topic === "ct" ? CT_TOPICS : topic ? ANATOMY_TOPICS : undefined;
    const queryTokens = [...new Set(tokenize(query))].filter(
      (token) => usable(token) && !QUERY_STOPWORDS.has(token),
    );
    const scored: { chunk: KnowledgeChunk; score: number }[] = [];
    for (const doc of docs) {
      if (allowed && !allowed.has(doc.chunk.topic)) continue;
      let score = 0;
      for (const token of queryTokens) {
        const frequency = doc.frequencies.get(token);
        if (!frequency) continue;
        const df = documentFrequency.get(token) ?? 0;
        const idf = Math.log(1 + (total - df + 0.5) / (df + 0.5));
        const denominator =
          frequency + K1 * (1 - B + (B * doc.length) / Math.max(averageLength, 1));
        score += (idf * frequency * (K1 + 1)) / denominator;
      }
      if (topic && doc.chunk.topic === topic) score *= 1.15;
      if (score > 0) scored.push({ chunk: doc.chunk, score });
    }
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, k).filter((item) => item.score >= minScore);
    const citations = top.map<Citation>((item, index) => {
      const meta = kb.sources[item.chunk.source];
      return {
        n: index + 1,
        id: item.chunk.id,
        title: item.chunk.title,
        text: item.chunk.text,
        sourceName: meta?.name ?? "来源未登记",
        url: meta?.url ?? "",
        license: meta?.license ?? "",
      };
    });
    return { citations, bestScore: top[0]?.score ?? 0 };
  };
}
