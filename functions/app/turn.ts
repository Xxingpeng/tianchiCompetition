import { describeFocus, FOCUS_DETAILS, focusDetail } from "./focus.ts";
import { assessDifficulty, classifyIntent, type Topic } from "./intent.ts";
import {
  buildTranscript,
  composeAnswerRequest,
  degradedAnswer,
  type HistoryMessage,
  type ReasoningMode,
} from "./prompt.ts";
import { emptyReply, insufficientReply, staticReply } from "./replies.ts";
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
  history: readonly HistoryMessage[];
  focus?: string;
}

type Retrieve = (query: string, topic?: Topic) => RetrievalResult;

// "它/这个"这类指代单独出现时靠当前选中的结构补全语境，避免被当成越界问题。
const ANAPHORA = /^(它|他|她|这个|那个|该|此)/;

function anchor(title: string | undefined, question: string): string {
  if (!title) return question;
  return normalize(question).includes(normalize(title)) ? question : `${title} ${question}`;
}

export function planTurn(input: TurnInput, retrieve: Retrieve, coldStart = false): TurnPlan {
  const question = input.text.trim();
  if (!question) return { kind: "static", reply: emptyReply() };

  const intent = classifyIntent(question);
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
        transcript: coldStart ? buildTranscript(input.history) : undefined,
        focusDetail: describeFocus(detail),
      }),
    };
  }

  // 当前选中的结构名一并进去检索，"它有什么作用"这类追问才有可检索的锚点。
  const selectedTitle = focusTitle(input.focus);
  const query = anchor(selectedTitle, question);
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
      transcript: coldStart ? buildTranscript(input.history) : undefined,
      focusTitle: selectedTitle,
    }),
  };
}

export { degradedAnswer };
