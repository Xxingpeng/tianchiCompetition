import { countChars, normalize } from "./text.ts";

export type Topic = "anatomy" | "ct" | "site" | "view";

export type StaticReply =
  "greeting" | "help" | "off_topic" | "unsafe" | "emergency" | "empty" | "select_structure";

export type Intent =
  { kind: "static"; reply: StaticReply } | { kind: "answer"; topic: Topic; matched: string[] };

const ANATOMY_TERMS = [
  "心脏",
  "心房",
  "心室",
  "心肌",
  "心包",
  "心耳",
  "心尖",
  "心底",
  "心腔",
  "心壁",
  "瓣膜",
  "瓣叶",
  "三尖瓣",
  "二尖瓣",
  "主动脉瓣",
  "肺动脉瓣",
  "房室瓣",
  "半月瓣",
  "主动脉",
  "肺动脉干",
  "肺静脉",
  "腔静脉",
  "冠状窦",
  "冠状动脉",
  "冠状循环",
  "窦房结",
  "房室结",
  "希氏束",
  "浦肯野",
  "传导",
  "心动周期",
  "收缩期",
  "舒张期",
  "射血",
  "心音",
  "体循环",
  "肺循环",
  "血液循环",
  "纵隔",
  "房间隔",
  "室间隔",
  "腱索",
  "乳头肌",
  "梳状肌",
  "卵圆窝",
  "心内膜",
  "心外膜",
  "心肌层",
  "瓣",
  "heart",
  "cardiac",
  "atrium",
  "atrial",
  "ventricle",
  "ventricular",
  "myocardium",
  "pericardium",
  "valve",
  "aorta",
  "aortic",
  "pulmonary",
  "coronary",
  "septum",
  "systole",
  "diastole",
  "circulation",
];

// 影像学习相关的词。刻意不收"扫描""窗口"这类日常高频词，避免把电脑问题当医学问题。
const CT_TERMS = [
  "ct",
  "断层",
  "影像",
  "阅片",
  "窗宽",
  "窗位",
  "对比剂",
  "增强扫描",
  "平扫",
  "辐射",
  "剂量",
  "密度",
  "hu",
  "hounsfield",
  "磁共振",
  "mri",
  "x线",
  "x光",
  "伪影",
  "门控",
  "钙化",
  "造影",
  "像素",
  "体素",
  "切片",
];

const SITE_TERMS = [
  "搜索框",
  "列表",
  "本站",
  "页面",
  "网站",
  "点选",
  "拖拽",
  "缩放",
  "复位",
  "悬停",
  "半透明",
  "网格",
  "示意",
];

// 针对页面里这套示意切面的提问。放在解剖词之前，避免"左心室在轴位第几层"被当成纯解剖题。
const VIEW_TERMS = [
  "切面",
  "高亮",
  "图例",
  "三视图",
  "轴位",
  "冠状位",
  "矢状位",
  "叠加",
  "层面",
  "第几层",
  "这张图",
  "这几张",
  "3d",
  "三维",
];

const GREETINGS = new Set([
  "你好",
  "您好",
  "hi",
  "hello",
  "hey",
  "哈喽",
  "在吗",
  "在么",
  "早上好",
  "上午好",
  "下午好",
  "晚上好",
  "嗨",
]);

const UNSAFE_PATTERNS: RegExp[] = [
  /(我|本人|家人|父亲|母亲|孩子|老人|朋友)[^。!?？]{0,12}(胸痛|胸闷|心慌|心悸|气短|头晕|晕倒|高血压|心脏病|不舒服|疼痛)/,
  /(怎么治|如何治|怎么治疗|咋治|吃什么药|用什么药|吃啥药|药量|用药|停药|换药|需要手术|要不要手术|做手术|放支架|搭桥|能活多久|预后|复发率)/,
  /(帮我诊断|诊断一下|看看我的|我是不是得了|我这种情况|严重吗|危险吗)/,
];

const EMERGENCY_PATTERN =
  /(救命|自杀|轻生|不想活|昏迷|休克|大出血|喘不上气|呼吸困难|剧烈胸痛|胸痛难忍)/;

export function assessDifficulty(raw: string): boolean {
  const text = normalize(raw);
  const length = countChars(text);
  let signals = 0;
  if (length >= 55) signals += 1;
  if (
    /(为什么|机制|原理|区别|比较|对比|有何不同|有什么不同|关系|如何理解|如何看|分析|推导|利弊|优缺点)/.test(
      text,
    )
  ) {
    signals += 1;
  }
  if ((text.match(/[?？]/g) ?? []).length >= 2) signals += 1;
  if (/(分别|各自|同时|步骤|过程|路径|影响)/.test(text)) signals += 1;
  return signals >= 2 || length >= 70;
}

function hits(text: string, terms: readonly string[]): string[] {
  return terms.filter((term) => text.includes(term));
}

export function classifyIntent(raw: string): Intent {
  const text = normalize(raw);
  if (!text) return { kind: "static", reply: "empty" };
  if (EMERGENCY_PATTERN.test(text)) return { kind: "static", reply: "emergency" };
  if (UNSAFE_PATTERNS.some((pattern) => pattern.test(text))) {
    return { kind: "static", reply: "unsafe" };
  }
  if (GREETINGS.has(text.replace(/[!！。.？?~～ ]+$/u, ""))) {
    return { kind: "static", reply: "greeting" };
  }
  if (/^(你是谁|你叫什么|你能做什么|你会什么|介绍一下你自己|你是什么)/.test(text)) {
    return { kind: "static", reply: "help" };
  }

  const anatomy = hits(text, ANATOMY_TERMS);
  const ct = hits(text, CT_TERMS);
  const site = hits(text, SITE_TERMS);
  const view = hits(text, VIEW_TERMS);

  // 影像问题的优先级最高："怎么看 CT" 要讲 CT，而不是讲按钮。
  if (ct.length > 0) return { kind: "answer", topic: "ct", matched: ct };
  if (view.length > 0) return { kind: "answer", topic: "view", matched: view };
  if (anatomy.length > 0) return { kind: "answer", topic: "anatomy", matched: anatomy };
  if (site.length > 0) return { kind: "static", reply: "help" };
  return { kind: "static", reply: "off_topic" };
}
