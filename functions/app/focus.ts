// 与 public/assets/structures.json 同源的展示事实；单测会逐条比对，防止页面与助手说法漂移。
export interface FocusDetail {
  title: string;
  en: string;
  parent: string;
  description: string;
  /** 三视图切层索引（0 起），取自各结构质心所在层。 */
  slices: { axial: number; coronal: number; sagittal: number };
}

export const FOCUS_DETAILS: Record<string, FocusDetail> = {
  lv: {
    title: "左心室",
    en: "Left ventricle",
    parent: "心腔",
    description: "四个心腔中壁最厚、腔最长的一个，位于心脏左下方，收缩时把血送入主动脉。",
    slices: { axial: 30, coronal: 52, sagittal: 69 },
  },
  myo: {
    title: "心肌",
    en: "Myocardium",
    parent: "心壁",
    description: "构成心室壁的肌肉层。左心室壁明显厚于右心室，因为它要对抗更高的后负荷。",
    slices: { axial: 13, coronal: 41, sagittal: 63 },
  },
  rv: {
    title: "右心室",
    en: "Right ventricle",
    parent: "心腔",
    description: "位于心脏最靠前的一面，壁薄、腔呈新月形包在左心室右侧，把血泵入肺动脉。",
    slices: { axial: 30, coronal: 27, sagittal: 44 },
  },
  la: {
    title: "左心房",
    en: "Left atrium",
    parent: "心腔",
    description: "位置最靠后的心腔，接收四条肺静脉回流的血，再经二尖口送入左心室。",
    slices: { axial: 46, coronal: 74, sagittal: 40 },
  },
  ra: {
    title: "右心房",
    en: "Right atrium",
    parent: "心腔",
    description: "接收上下腔静脉回流的血，位于心脏右上方，与右心室以三尖口相通。",
    slices: { axial: 53, coronal: 58, sagittal: 19 },
  },
  aorta: {
    title: "升主动脉",
    en: "Ascending aorta",
    parent: "主动脉",
    description: "自主动脉口向上的一小段，发出左右冠状动脉后移行为主动脉弓。",
    slices: { axial: 59, coronal: 50, sagittal: 41 },
  },
  pa: {
    title: "肺动脉干",
    en: "Pulmonary trunk",
    parent: "肺动脉",
    description: "起自右心室，向左后上方走行后分为左右肺动脉，是把血送进肺的动脉。",
    slices: { axial: 74, coronal: 43, sagittal: 55 },
  },
  pv: {
    title: "肺静脉",
    en: "Pulmonary veins",
    parent: "肺静脉",
    description: "通常左右各两条，开口于左心房后壁，把已换气的血回流入左心。",
    slices: { axial: 67, coronal: 60, sagittal: 9 },
  },
  lxa: {
    title: "左心耳",
    en: "Left auricle",
    parent: "左心房",
    description: "左心房向前突出的耳状盲端，表面有梳状肌，是心房壁最薄处之一。",
    slices: { axial: 75, coronal: 75, sagittal: 41 },
  },
};

export function focusDetail(id: unknown): FocusDetail | undefined {
  return typeof id === "string" && Object.hasOwn(FOCUS_DETAILS, id) ? FOCUS_DETAILS[id] : undefined;
}

export function describeFocus(detail: FocusDetail): string {
  return [
    `用户在页面上查看：${detail.title}（${detail.en}，属 ${detail.parent}）。`,
    `页面说明：${detail.description}`,
    `三视图取层索引（0 起）：轴位 ${detail.slices.axial}、冠状位 ${detail.slices.coronal}、矢状位 ${detail.slices.sagittal}；该层是该结构体素最密的一层，高亮即为它。`,
  ].join("\n");
}
