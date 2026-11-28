"""页面文案的唯一来源：结构的中文名、英文名、同义词、学习说明、上级关系、配色、冻结标签。

为什么单独一个模块：BP3D 路线和兜底路线必须产出**完全一致**的页面文案，否则换一次几何来源
文字就变了。整数标签在这里冻结，依据是研究仓库 2026-11-20 的标签纠正声明：
1 心肌 / 2 左心房 / 3 左心室 / 4 右心房 / 5 右心室 / 6 升主动脉 / 7 肺动脉；
8 肺静脉、9 左心耳为本项目自定的示意编号（研究侧把这两类标注为"假设"，不沿用其整数映射）。

注意：不要与 `02_Working/src/fma_seg/text/target_labels.py` 的别名→整数表混用，
那张表纠正前把 1 当成左心室，与这里的 1=心肌 冲突。
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class StructureMeta:
    id: str
    label: int
    name: str
    en_name: str
    aliases: tuple[str, ...]
    description: str
    parent: str
    color: str

    @property
    def rgb(self) -> tuple[int, int, int]:
        h = self.color.lstrip("#")
        return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


# 顺序即页面目录顺序。描述刻意写成"是什么 + 在哪 + 学习要点"，不含诊断或治疗建议。
STRUCTURES: tuple[StructureMeta, ...] = (
    StructureMeta(
        id="lv",
        label=3,
        name="左心室",
        en_name="Left ventricle",
        aliases=("左室", "left ventricle", "LV", "左心室腔"),
        description="四个心腔中壁最厚、腔最长的一个，位于心脏左下方，收缩时把血送入主动脉。",
        parent="心腔",
        color="#bf4d5c",
    ),
    StructureMeta(
        id="myo",
        label=1,
        name="心肌",
        en_name="Myocardium",
        aliases=("左心室心肌", "心室壁", "myocardium", "LV myocardium"),
        description="构成心室壁的肌肉层。左心室壁明显厚于右心室，因为它要对抗更高的后负荷。",
        parent="心壁",
        color="#a06a42",
    ),
    StructureMeta(
        id="rv",
        label=5,
        name="右心室",
        en_name="Right ventricle",
        aliases=("右室", "right ventricle", "RV", "右心室腔"),
        description="位于心脏最靠前的一面，壁薄、腔呈新月形包在左心室右侧，把血泵入肺动脉。",
        parent="心腔",
        color="#4a7fb5",
    ),
    StructureMeta(
        id="la",
        label=2,
        name="左心房",
        en_name="Left atrium",
        aliases=("左房", "left atrium", "LA", "左心房腔"),
        description="位置最靠后的心腔，接收四条肺静脉回流的血，再经二尖口送入左心室。",
        parent="心腔",
        color="#7d6aa8",
    ),
    StructureMeta(
        id="ra",
        label=4,
        name="右心房",
        en_name="Right atrium",
        aliases=("右房", "right atrium", "RA", "右心房腔"),
        description="接收上下腔静脉回流的血，位于心脏右上方，与右心室以三尖口相通。",
        parent="心腔",
        color="#4f8f86",
    ),
    StructureMeta(
        id="aorta",
        label=6,
        name="升主动脉",
        en_name="Ascending aorta",
        aliases=("升主动脉", "ascending aorta", "AAo", "主动脉升部"),
        description="自主动脉口向上的一小段，发出左右冠状动脉后移行为主动脉弓。",
        parent="主动脉",
        color="#b04a44",
    ),
    StructureMeta(
        id="pa",
        label=7,
        name="肺动脉干",
        en_name="Pulmonary trunk",
        aliases=("肺动脉", "pulmonary trunk", "pulmonary artery", "PA"),
        description="起自右心室，向左后上方走行后分为左右肺动脉，是把血送进肺的动脉。",
        parent="肺动脉",
        color="#5d76ad",
    ),
    StructureMeta(
        id="pv",
        label=8,
        name="肺静脉",
        en_name="Pulmonary veins",
        aliases=("肺静脉", "pulmonary vein", "PV"),
        description="通常左右各两条，开口于左心房后壁，把已换气的血回流入左心。",
        parent="肺静脉",
        color="#7d9b62",
    ),
    StructureMeta(
        id="lxa",
        label=9,
        name="左心耳",
        en_name="Left auricle",
        aliases=("左心耳", "left auricle", "left atrial appendage", "LAA"),
        description="左心房向前突出的耳状盲端，表面有梳状肌，是心房壁最薄处之一。",
        parent="左心房",
        color="#8a76a8",
    ),
)

BY_ID: dict[str, StructureMeta] = {s.id: s for s in STRUCTURES}
BY_LABEL: dict[int, StructureMeta] = {s.label: s for s in STRUCTURES}

# 三视图与 3D 共用的模型空间：体积中心即模型原点。
MODEL_EXTENT_MM = 150.0
VIEWS: tuple[str, ...] = ("axial", "coronal", "sagittal")
VIEW_NAMES: dict[str, str] = {"axial": "轴位", "coronal": "冠状位", "sagittal": "矢状位"}
DISCLAIMER = (
    "示意结构模型，非真实病例影像，亦非分割模型推理结果；仅用于解剖学习展示，不含诊断或治疗建议。"
)
BP3D_NOTICE = (
    "BodyParts3D, © The Database Center for Life Science "
    "licensed under CC Attribution 4.0 International"
)
