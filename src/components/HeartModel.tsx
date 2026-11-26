import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { isTap, partOpacity } from "../data/heart";
import type { StructureRecord } from "../types";

type Status = { kind: "loading" } | { kind: "ready" } | { kind: "failed"; reason: string };

interface Props {
  structures: StructureRecord[];
  selectedId: string | null;
  onSelect: (structure: StructureRecord) => void;
}

interface SceneApi {
  dolly: (factor: number) => void;
  reset: () => void;
  applyOpacities: (selectedId: string | null) => void;
}

const VIEW_SIZE = 900;
const NO_WEBGL = "当前环境不支持 WebGL，整体 3D 视图已停用；三视图与信息卡不受影响。";

/** 探测放在渲染期：没有 WebGL 时整块区域直接不挂载，不必在 effect 里改状态。 */
function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * 整颗心脏：9 个部件 GLB 共用同一套世界毫米坐标（见 tools/asset_pipeline/surface.py），
 * 放进同一个场景即自动拼合成型，不需要任何配准。点击部件选结构，悬停显示名称。
 */
export function HeartModel({ structures, selectedId, onSelect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const supported = useMemo(() => hasWebGL(), []);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const apiRef = useRef<SceneApi | null>(null);
  // 回调每次渲染都是新函数；用 ref 接住，避免重新加载 9 个 GLB。
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const host = hostRef.current;
    if (!supported || !host) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(VIEW_SIZE, VIEW_SIZE, false);
    // 绘制缓冲区固定，CSS 只许缩不许放：宽屏把 640 缓冲拉伸到整栏会发糊。
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.maxWidth = `${VIEW_SIZE}px`;
    renderer.domElement.style.height = "auto";
    host.replaceChildren(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    // three 的物理光照把出射算成 albedo*irradiance/π：受光面要贴回色卡本色，辐照得凑到 2.5 上下。
    // 发白不是灯太亮，是半透明层叠多了混色（见 applyOpacities 与 DIMMED_OPACITY）。
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a424a, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(0.6, 0.8, 1);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.3);
    fill.position.set(-0.8, -0.3, -0.6);
    scene.add(fill);

    const root = new THREE.Group();
    scene.add(root);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.addEventListener("change", () => renderer.render(scene, camera));

    let home = { position: new THREE.Vector3(0, 0, 3), target: new THREE.Vector3() };
    const materials = new Map<string, THREE.MeshStandardMaterial[]>();

    function applyOpacities(id: string | null): void {
      for (const [structureId, list] of materials) {
        for (const material of list) {
          const opacity = partOpacity(id, structureId);
          // 选中件要走不透明通道：留在半透明队列里会被自己和背后的部件混色,颜色发灰。
          material.transparent = opacity < 1;
          material.opacity = opacity;
          // 半透明层再写深度会把后面的部件整个挡掉。
          material.depthWrite = opacity > 0.9;
          material.needsUpdate = true;
        }
      }
      renderer.render(scene, camera);
    }

    apiRef.current = {
      dolly: (factor: number) => {
        camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);
        controls.update();
        renderer.render(scene, camera);
      },
      reset: () => {
        camera.position.copy(home.position);
        controls.target.copy(home.target);
        controls.update();
        renderer.render(scene, camera);
      },
      applyOpacities,
    };

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function pick(event: PointerEvent): string | null {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(root, true)[0];
      if (!hit) return null;
      const raw: unknown = (hit.object.userData as Record<string, unknown>).structureId;
      return typeof raw === "string" ? raw : null;
    }

    let downX = 0;
    let downY = 0;
    let downId: string | null = null;

    function onPointerDown(event: PointerEvent): void {
      downX = event.clientX;
      downY = event.clientY;
      downId = pick(event);
    }

    /** 按下载与抬起都算过一遍：拖拽超过阈值不当作点击,按下时命中的部件在抬起略偏时仍然有效。 */
    function onPointerUp(event: PointerEvent): void {
      if (!isTap(event.clientX - downX, event.clientY - downY)) return;
      const id = pick(event) ?? downId;
      const structure = structures.find((s) => s.id === id);
      if (structure) onSelectRef.current(structure);
    }

    function onPointerMove(event: PointerEvent): void {
      const id = pick(event);
      renderer.domElement.style.cursor = id ? "pointer" : "";
      setHoveredId((current) => (current === id ? current : id));
    }

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointermove", onPointerMove);

    let cancelled = false;
    const loader = new GLTFLoader();
    // 每个任务把结构记录和网格一起带回来，省掉一次按下标配对的下标访问。
    const jobs = structures.map(
      (structure) =>
        new Promise<{ structure: StructureRecord; part: THREE.Group }>((resolve, reject) => {
          loader.load(
            `/${structure.mesh}`,
            (gltf) => resolve({ structure, part: gltf.scene }),
            undefined,
            (error: unknown) => reject(new Error(`${structure.mesh}：${String(error)}`)),
          );
        }),
    );

    Promise.all(jobs).then(
      (parts) => {
        if (cancelled) {
          for (const { part } of parts) dispose(part);
          return;
        }
        for (const { structure, part } of parts) {
          // 每个结构一份材质：色块、切面高亮和 3D 部件必须是同一个颜色。
          const material = new THREE.MeshStandardMaterial({
            color: structure.color,
            // 高金属度 + 低粗糙度会在整个面上铺一层白色高光,把中饱和的色卡冲淡成马卡龙色。
            roughness: 0.85,
            metalness: 0,
            side: THREE.DoubleSide,
            transparent: true,
          });
          part.traverse((child) => {
            if (child.type !== "Mesh") return;
            const mesh = child as THREE.Mesh;
            mesh.material = material;
            mesh.userData.structureId = structure.id;
          });
          materials.set(structure.id, [material]);
          root.add(part);
        }

        const box = new THREE.Box3();
        box.setFromObject(root);
        const center = box.getCenter(new THREE.Vector3());
        // 部件坐标是世界毫米。先把整颗心脏最长边归一到 2 个世界单位再取景。
        const size = Math.max(box.getSize(new THREE.Vector3()).length(), 1e-6);
        const scale = 2 / size;
        root.scale.setScalar(scale);
        root.position.copy(center).multiplyScalar(-scale);

        box.setFromObject(root);
        box.getCenter(center);
        const distance = 3.2;
        camera.position.set(center.x, center.y, center.z + distance);
        controls.target.copy(center);
        controls.minDistance = distance / 4;
        controls.maxDistance = distance * 6;
        home = { position: camera.position.clone(), target: center.clone() };
        controls.update();
        // 透明度交给下面那个 effect：status 翻到 ready 会再跑一次，这里不碰 selectedId。
        setStatus({ kind: "ready" });
      },
      (error: unknown) => {
        if (!cancelled) {
          setStatus({
            kind: "failed",
            reason: `部件网格加载失败：${error instanceof Error ? error.message : String(error)}`,
          });
        }
      },
    );

    return () => {
      cancelled = true;
      apiRef.current = null;
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      controls.dispose();
      dispose(scene);
      renderer.dispose();
      host.replaceChildren();
    };
    // selectedId 只影响材质透明度，走下面那个 effect；把它放进依赖会让每次选中都重载 9 个 GLB。
  }, [structures, supported]);

  useEffect(() => {
    apiRef.current?.applyOpacities(selectedId);
  }, [selectedId, status]);

  const hovered = structures.find((s) => s.id === hoveredId) ?? null;
  const selected = structures.find((s) => s.id === selectedId) ?? null;

  return (
    <section className="heart-viewer" aria-labelledby="heart-heading">
      <h2 id="heart-heading">心脏整体形态</h2>
      <p className="heart-help">
        拖拽旋转，滚轮缩放；把鼠标放到部件上显示名称，单击部件即选中该结构。
        {structures.length} 个部件来自同一份标注体素，颜色与三视图高亮一致。
      </p>

      {!supported && (
        <p role="status" className="heart-status">
          {NO_WEBGL}
        </p>
      )}

      {supported && (
        <>
          <div ref={hostRef} className="heart-host" />
          <p role="status" className="heart-status">
            {status.kind === "loading" && `正在合成整颗心脏：载入 ${structures.length} 个部件…`}
            {status.kind === "ready" && hovered && `悬停：${hovered.name}（${hovered.en_name}）`}
            {status.kind === "ready" &&
              !hovered &&
              selected &&
              `已高亮 ${selected.name}，其余部件半透明。`}
            {status.kind === "ready" &&
              !hovered &&
              !selected &&
              "点击任一部件查看说明；拖拽旋转，滚轮缩放。"}
            {status.kind === "failed" && status.reason}
          </p>
          {status.kind !== "failed" && (
            <div className="heart-buttons">
              <button type="button" onClick={() => apiRef.current?.dolly(0.8)}>
                放大
              </button>
              <button type="button" onClick={() => apiRef.current?.dolly(1.25)}>
                缩小
              </button>
              <button type="button" onClick={() => apiRef.current?.reset()}>
                复位视角
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** GLB 与场景对象都要显式释放：来回切结构不释放会一路累积 GPU 资源。 */
function dispose(root: THREE.Object3D): void {
  root.traverse((child) => {
    // traverse 的回调参数是 Object3D，用 type 判型再收窄，比 instanceof 更贴近 three 的运行时约定。
    if (child.type !== "Mesh") return;
    const mesh = child as THREE.Mesh;
    mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) material.dispose();
  });
}
