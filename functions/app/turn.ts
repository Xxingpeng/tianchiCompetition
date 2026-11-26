import { describeCtSlice, wantsCtSlice, type CtSliceFact } from "./ct.ts";
import { describeFocus, FOCUS_DETAILS, focusDetail } from "./focus.ts";
import { assessDifficulty, classifyIntent, isOverviewQuestion, type Topic } from "./intent.ts";
import { composeAnswerRequest, degradedAnswer, type ReasoningMode } from "./prompt.ts";
import {
  emptyReply,
  historyQuestionsReply,
  insufficientReply,
  staticReply,
  type HistoryTurn,
} from "./replies.ts";
import { normalize } from "./text.ts";
import type { Citation, RetrievalResult } from "./retrieval.ts";

export const FOCUS_TITLES: Record<string, string> = Object.fromEntries(
  Object.entries(FOCUS_DETAILS).map(([id, detail]) => [id, detail.title]),
);

export function focusTitle(focus: unknown): string | undefined {
  return focusDetail(focus)?.title;
}

export type TurnPlan =
  | { kind: "static"; reply: string }
  | { kind: "insufficient"; reply: string }
  | {
      kind: "answer";
      topic: Topic;
      mode: ReasoningMode;
      userMessage: string;
      citations: Citation[];
    };

export interface TurnInput {
  text: string;
  focus?: string;
  ct?: CtSliceFact;
  history?: readonly HistoryTurn[];
}

type Retrieve = (query: string, topic?: Topic) => RetrievalResult;

// "它/这个"这类指代单独出现时靠当前选中的结构补全语境，避免被当成越界问题。
const ANAPHORA = /^(它|他|她|这个|那个|该|此)/;
const FOCUS_REFERENCE =
  /(^|[^们])它|(这个|那个|该)(结构|心腔|瓣|层|图)|(当前|现在|正在)[^。！？?]{0,4}(查看|选中|选择|看|显示|高亮)|选中的|高亮的/;

// 只有问题本身指向"当前看到的东西"时才带页面焦点；泛指心脏结构时不要主动播报选中项。
function asksAboutFocus(question: string, topic: Topic): boolean {
  if (topic === "view") return true;
  return ANAPHORA.test(question) || FOCUS_REFERENCE.test(question);
}

function anchor(title: string | undefined, question: string): string {
  if (!title) return question;
  return normalize(question).includes(normalize(title)) ? question : `${title} ${question}`;
}

// 上级分类词用于泛问；单查"心脏有哪些结构"命中不了心腔、瓣膜等具体条目。
const OVERVIEW_QUERY = "心壁 瓣膜 大血管 传导系统 心腔";

export function planTurn(input: TurnInput, retrieve: Retrieve): TurnPlan {
  const question = input.text.trim();
  if (!question) return { kind: "static", reply: emptyReply() };

  const intent = classifyIntent(question);
  if (intent.kind === "meta") {
    return { kind: "static", reply: historyQuestionsReply(input.history ?? []) };
  }

  const ct = input.ct;
  const blocked =
    intent.kind === "static" &&
    (intent.reply === "emergency" || intent.reply === "unsafe" || intent.reply === "empty");
  if (ct && !blocked && wantsCtSlice(question)) {
    const selectedTitle = ct.selected?.name;
    const query = [selectedTitle, "CT", "轴位", ct.windowName].filter(Boolean).join(" ");
    let { citations } = retrieve(query, "ct");
    if (citations.length === 0) {
      citations = retrieve("CT 轴位 纵隔窗 窗宽窗位", "ct").citations;
    }
    if (citations.length === 0) {
      return { kind: "static", reply: describeCtSlice(ct) };
    }
    const mode: ReasoningMode = assessDifficulty(question) ? "tot" : "cot";
    return {
      kind: "answer",
      topic: "ct",
      mode,
      citations,
      userMessage: composeAnswerRequest({
        question,
        citations,
        mode,
        ctDetail: describeCtSlice(ct),
      }),
    };
  }

  let topic: Topic;
  if (intent.kind === "static") {
    const selected = focusTitle(input.focus);
    if (intent.reply === "off_topic" && selected && ANAPHORA.test(question)) {
      topic = "anatomy";
    } else if (intent.reply === "empty") {
      return { kind: "static", reply: emptyReply() };
    } else {
      return { kind: "static", reply: staticReply(intent.reply) };
    }
  } else {
    topic = intent.topic;
  }

  if (topic === "view") {
    const detail = focusDetail(input.focus);
    if (!detail) return { kind: "static", reply: staticReply("select_structure") };
    let { citations } = retrieve(anchor(detail.title, question), "anatomy");
    if (citations.length === 0) {
      citations = retrieve(detail.description, "anatomy").citations;
    }
    if (citations.length === 0) {
      return { kind: "insufficient", reply: insufficientReply(question) };
    }
    const mode: ReasoningMode = assessDifficulty(question) ? "tot" : "cot";
    return {
      kind: "answer",
      topic,
      mode,
      citations,
      userMessage: composeAnswerRequest({
        question,
        citations,
        mode,
        focusDetail: describeFocus(detail),
      }),
    };
  }

  const wantsFocus = asksAboutFocus(question, topic);
  const selectedTitle = wantsFocus ? focusTitle(input.focus) : undefined;
  // 泛问用一组上级分类词检索；只有指代当前结构时才把结构名并进查询。
  const query =
    topic === "anatomy" && isOverviewQuestion(question)
      ? OVERVIEW_QUERY
      : wantsFocus
        ? anchor(selectedTitle, question)
        : question;
  const { citations } = retrieve(query, topic);
  if (citations.length === 0) {
    return { kind: "insufficient", reply: insufficientReply(question) };
  }
  const mode: ReasoningMode = assessDifficulty(question) ? "tot" : "cot";
  return {
    kind: "answer",
    topic,
    mode,
    citations,
    userMessage: composeAnswerRequest({
      question,
      citations,
      mode,
      ...(wantsFocus && selectedTitle ? { focusTitle: selectedTitle } : {}),
    }),
  };
}

export { degradedAnswer };
