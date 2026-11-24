import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { StructureRecord } from "../types";

type Status = { kind: "loading" } | { kind: "ready" } | { kind: "failed"; reason: string };

interface MeshApi {
  dolly: (factor: number) => void;
  reset: () => void;
}

interface Props {
  structure: StructureRecord;
}

const VIEW_SIZE = 480;
const NO_WEBGL = "当前环境不支持 WebGL，3D 区域已停用；三视图与本页其余功能不受影响。";

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
 * 轻量 3D：拖拽旋转 + 滚轮/按钮缩放（US-5 AC1）。
 * 加载失败时只降级这一块区域，页面其余部分照常可用（US-5 AC2）。
 */
export function MeshViewer({ structure }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const supported = useMemo(() => hasWebGL(), []);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const apiRef = useRef<MeshApi | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!supported || !host) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(VIEW_SIZE, VIEW_SIZE, false);
    // 绘制缓冲区固定 480，CSS 只允许缩到容器宽、不允许再放大：否则宽屏画布会撑满整栏，
    // 把 480 的缓冲区拉伸到 1280 CSS px，既占屏又糊。
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.maxWidth = `${VIEW_SIZE}px`;
    renderer.domElement.style.height = "auto";
    host.replaceChildren(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(1, 1, 1);
    scene.add(key);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.addEventListener("change", () => renderer.render(scene, camera));

    let home = { position: new THREE.Vector3(0, 0, 3), target: new THREE.Vector3() };
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
    };

    let cancelled = false;
    new GLTFLoader().load(
      `/${structure.mesh}`,
      (gltf) => {
        if (cancelled) {
          dispose(gltf.scene);
          return;
        }
        // 整份结构用同一个材质：色块、切面高亮和 3D 网格必须是同一个颜色。
        const material = new THREE.MeshStandardMaterial({
          color: structure.color,
          roughness: 0.6,
          metalness: 0.05,
          side: THREE.DoubleSide,
        });
        gltf.scene.traverse((child) => {
          if (child instanceof THREE.Mesh) child.material = material;
        });
        scene.add(gltf.scene);

        const box = new THREE.Box3();
        box.setFromObject(gltf.scene);
        const center = box.getCenter(new THREE.Vector3());
        // 网格单位是体素（mm 级）。先把最长边归一到 2 个世界单位再取景，相机距离才有确定值。
        const size = Math.max(box.getSize(new THREE.Vector3()).length(), 1e-6);
        const scale = 2 / size;
        gltf.scene.scale.setScalar(scale);
        gltf.scene.position.copy(center).multiplyScalar(-scale);

        box.setFromObject(gltf.scene);
        box.getCenter(center);
        const distance = 2.6;
        camera.position.set(center.x, center.y, center.z + distance);
        controls.target.copy(center);
        controls.minDistance = distance / 4;
        controls.maxDistance = distance * 6;
        home = { position: camera.position.clone(), target: center.clone() };
        controls.update();
        renderer.render(scene, camera);
        setStatus({ kind: "ready" });
      },
      undefined,
      (error: unknown) => {
        if (cancelled) return;
        setStatus({ kind: "failed", reason: `网格 ${structure.mesh} 加载失败：${String(error)}` });
      },
    );

    return () => {
      cancelled = true;
      apiRef.current = null;
      controls.dispose();
      dispose(scene);
      renderer.dispose();
      host.replaceChildren();
    };
  }, [structure, supported]);

  return (
    <section className="mesh-viewer" aria-labelledby="mesh-heading">
      <h3 id="mesh-heading">三维形态</h3>
      <p className="mesh-help">拖拽旋转，滚轮缩放；也可用下方按钮。数据来自与三视图同一份体素。</p>

      {!supported && (
        <p role="status" className="mesh-status">
          {NO_WEBGL}
        </p>
      )}

      {supported && (
        <>
          <div ref={hostRef} className="mesh-host" />
          <p role="status" className="mesh-status">
            {status.kind === "loading" && `正在载入 ${structure.name} 的网格…`}
            {status.kind === "ready" && `${structure.name}：${structure.provenance}`}
            {status.kind === "failed" && status.reason}
          </p>
          {status.kind !== "failed" && (
            <div className="mesh-buttons">
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

/** GLB 与场景对象都要显式释放：单页里来回切结构，不释放会一路累积 GPU 资源。 */
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
