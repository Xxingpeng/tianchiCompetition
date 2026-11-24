import type { StructureRecord } from "../types";

interface Props {
  structure: StructureRecord;
}

/** 信息卡：四项必填由构建期与运行期双重校验保证非空（US-3 AC1/AC2）。 */
export function InfoCard({ structure }: Props) {
  return (
    <section className="info-card" aria-labelledby="info-heading">
      <h3 id="info-heading">
        <span className="swatch" style={{ backgroundColor: structure.color }} aria-hidden="true" />
        {structure.name}
      </h3>
      <dl>
        <dt>英文名</dt>
        <dd>{structure.en_name}</dd>

        <dt>常见别名</dt>
        <dd>{structure.aliases.join("、")}</dd>

        <dt>上级结构</dt>
        <dd>{structure.parent}</dd>

        <dt>学习说明</dt>
        <dd>{structure.description}</dd>

        <dt>几何来源</dt>
        <dd>{structure.provenance}</dd>

        <dt>体素数</dt>
        <dd>{structure.stats.voxels.toLocaleString("zh-CN")}</dd>
      </dl>
    </section>
  );
}
