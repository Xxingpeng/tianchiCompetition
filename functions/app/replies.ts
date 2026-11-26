import { truncate } from "./text.ts";
import type { StaticReply } from "./intent.ts";

// 静态回复不经过模型：问候、站内用法、越界与安全分流都零 token 开销。
const REPLIES: Record<Exclude<StaticReply, "empty">, string> = {
  greeting:
    "你好，我是小医。可以问我心脏的结构、瓣膜与血流、传导系统，或者 CT 的窗宽窗位这类基础知识。想从哪个结构开始？",
  help: "用法：在左侧搜索或列表里选结构，右侧整颗心脏可拖拽旋转、点选部件，三视图和详情会同步。我的回答范围限于心脏解剖与 CT 阅片基础，例如「左心室为什么壁厚」「窗宽窗位是什么」。回答里的 [1][2] 对应下方列出的来源。本站模型是教学示意，不是真实病例。",
  off_topic:
    "这个问题超出了我的范围。我只讲心脏解剖和 CT 阅片的基础知识，比如心腔、瓣膜、血液循环、窗宽窗位。要不要换个相关的问题？",
  unsafe:
    "这涉及个人症状、用药或手术选择，我不能给建议，也不想误导你——请尽快咨询医生或到心内科就诊。我可以讲背后的解剖与原理，比如「冠状动脉和心肌供血是什么关系」。",
  emergency:
    "如果正在出现持续胸痛、呼吸困难、晕厥或大出血，请立刻拨打 120 或去最近的急诊，不要在这里等待回答。情况稳定后想了解相关解剖知识，我随时在。",
  select_structure:
    "先在左侧搜索框或列表里选一个结构，我就能结合页面上这套三视图的取层与高亮来解释它。也可以直接说结构名，例如「左心室的轴位切面在第几层」。",
};

export function staticReply(kind: Exclude<StaticReply, "empty">): string {
  return REPLIES[kind];
}

export function emptyReply(): string {
  return "请输入一个关于心脏解剖或 CT 基础的问题。";
}

export function insufficientReply(question: string): string {
  const quoted = truncate(question, 24);
  return `暂时没有找到可靠资料来回答「${quoted}」。我现在覆盖：心脏位置与心包、心壁三层、四个心腔与瓣膜、腱索与乳头肌、大血管、冠脉循环、传导系统、心动周期，以及 CT 的 HU、窗宽窗位、增强与剂量。可以换个问法，或直接点左侧结构看三视图。`;
}
