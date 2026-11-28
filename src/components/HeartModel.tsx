import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { faceTurnAngle, focusedColor, isTap, partColor } from "../data/heart";
import type { StructureRecord } from "../types";

type Status = { kind: "loading" } | { kind: "ready" } | { kind: "failed"; reason: string };

interface Props {
  structures: StructureRecord[];
  selectedId: string | null;
  onSelect: (structure: StructureRecord) => void;
  /** 首次点过结构后，模型下方的操作提示就收起，不再回来。 */
  hintDismissed?: boolean;
  /** 从索引点选结构时递增的令牌：把该部件转到正面并追随打光。 */
  turn?: { id: string; token: number } | null;
}

interface SceneApi {
  dolly: (factor: number) => void;
  reset: () => void;
  applySelection: (selectedId: string | null) => void;
  turnTo: (id: string | null) => void;
  setPulse: (enabled: boolean) => void;
  setSpotlight: (enabled: boolean) => void;
}

// 渲染缓冲按容器尺寸 × 设备像素比自适应，只设上限：宽屏用满物理像素，小屏不浪费填充率。
const MAX_BUFFER = 2048;
const NO_WEBGL = "当前环境不支持 WebGL，整体 3D 视图已停用。";
// 包围盒高度占舞台 70% 反推距离；7° 右前斜给台阶面多一个受光角度，不死板贴正。
const HOME_FOV = 35;
const HOME_HEIGHT_RATIO = 0.7;
const HOME_WIDTH_RATIO = 0.78;
const HOME_AZIMUTH = (7 * Math.PI) / 180;
// 舞台聚光灯：选中结构后 600ms 内把光心移到该结构，并收窄锥角。
const SPOT_INTENSITY = 3.1;
const SPOT_AMBIENT = 0.5;
const SPOT_ANGLE = 0.32;
const SPOT_FOLLOW_ANGLE = 0.24;
const FOLLOW_MS = 600;
// 索引点选后整颗心脏转到该部件正对相机的时长。
const TURN_MS = 800;
const Z_AXIS = new THREE.Vector3(0, 0, 1);
// 72 次/分的“扑通”双搏动：0.16 处主搏动、0.40 处次搏动，其余时间为舒张期。
const BEAT_PERIOD_MS = 60_000 / 72;
const LUB_GAIN = 0.015;
const DUB_GAIN = 0.007;

function prefersReducedMotion(): boolean {
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

/** 单个搏动包络：峰值 1，边缘为 0 且一阶导连续，周期回绕时不会跳变。 */
function beatBump(phase: number, center: number, width: number): number {
  const distance = Math.abs(phase - center);
  if (distance >= width) return 0;
  return 0.5 * (1 + Math.cos((Math.PI * distance) / width));
}

function pulseScaleAt(elapsedMs: number): number {
  const phase = (elapsedMs % BEAT_PERIOD_MS) / BEAT_PERIOD_MS;
  return 1 + LUB_GAIN * beatBump(phase, 0.16, 0.1) + DUB_GAIN * beatBump(phase, 0.4, 0.08);
}

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
export function HeartModel({
  structures,
  selectedId,
  onSelect,
  hintDismissed = false,
  turn = null,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const supported = useMemo(() => hasWebGL(), []);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pulseEnabled, setPulseEnabled] = useState(() => !prefersReducedMotion());
  const [spotEnabled, setSpotlightEnabled] = useState(true);
  const apiRef = useRef<SceneApi | null>(null);
  // 回调每次渲染都是新函数；用 ref 接住，避免重新加载 9 个 GLB。
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.heartPulse = pulseEnabled ? "on" : "off";
    return () => {
      delete root.dataset.heartPulse;
    };
  }, [pulseEnabled]);

  useEffect(() => {
    const host = hostRef.current;
    if (!supported || !host) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    host.replaceChildren(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(HOME_FOV, 1, 0.01, 100);
    // GLB 的 +z 是“上”。把相机上方向也对齐 +z，初始画面就是解剖学直立位，
    // 横向拖拽才会绕人体上下轴旋转，而不是像方向盘一样滚转。
    camera.up.set(0, 0, 1);
    // 舞台灯只有一盏暖白聚光灯做主光；半球光只兜环境底噪，冷补光只保背光面轮廓。
    const ambient = new THREE.HemisphereLight(0xe9eefb, 0x241f1b, SPOT_AMBIENT);
    scene.add(ambient);

    const spot = new THREE.SpotLight(0xfff1dd, SPOT_INTENSITY, 0, SPOT_ANGLE, 0.62, 0);
    spot.position.set(-1.5, -3.4, 2.1);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0005;
    spot.shadow.normalBias = 0.02;
    scene.add(spot);
    scene.add(spot.target);

    const rim = new THREE.DirectionalLight(0x9db4d6, 0.45);
    rim.position.set(1.1, 0.9, -0.7);
    scene.add(rim);

    // 浮尘：静态微粒，只保留在灯位到心脏的一带。
    const dust = makeDust(spot.position, spot.target.position, SPOT_ANGLE);
    scene.add(dust);

    const root = new THREE.Group();
    scene.add(root);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.addEventListener("change", () => renderer.render(scene, camera));
    // 真正拖过才算用户改过视角；单击选中触发的侧栏开合仍然自动重新构图。
    let userMoved = false;

    const materials = new Map<string, THREE.MeshStandardMaterial[]>();
    const ghostMaterials = new Map<string, THREE.MeshBasicMaterial>();
    const ghosts = new Map<string, THREE.Mesh[]>();
    const baseColors = new Map<string, string>();
    let ready = false;
    let baseScale = 1;
    const baseCenter = new THREE.Vector3();
    let pulseOn = false;
    let pulseFrame = 0;
    let pulseStartedAt = 0;
    let lastPulsePaint = 0;

    function paintPulse(now: number): void {
      const scale = baseScale * pulseScaleAt(now - pulseStartedAt);
      root.scale.setScalar(scale);
      // 归一化后模型中心在原点；缩放时同步平移，保证搏动围绕心脏中心而不是场景原点。
      root.position.copy(baseCenter).multiplyScalar(-scale);
      renderer.render(scene, camera);
    }

    function pulseStep(now: number): void {
      if (!pulseOn) return;
      // 搏动只需约 30 帧/秒，省一点 GPU；慢节律下肉眼看不出差别。
      if (now - lastPulsePaint >= 33) {
        lastPulsePaint = now;
        paintPulse(now);
      }
      pulseFrame = requestAnimationFrame(pulseStep);
    }

    function setPulse(enabled: boolean): void {
      if (!ready || enabled === pulseOn) return;
      if (enabled) {
        pulseOn = true;
        pulseStartedAt = performance.now();
        lastPulsePaint = 0;
        pulseFrame = requestAnimationFrame(pulseStep);
        return;
      }
      pulseOn = false;
      cancelAnimationFrame(pulseFrame);
      root.scale.setScalar(baseScale);
      root.position.copy(baseCenter).multiplyScalar(-baseScale);
      renderer.render(scene, camera);
    }

    /** 7° 右前斜取景：高度按包围盒 70%，横向按旋转后的投影宽兜底，心脏落在页面正中。 */
    function frameHome(): void {
      const box = new THREE.Box3().setFromObject(root);
      if (box.isEmpty()) return;
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const tanHalf = Math.tan((HOME_FOV * Math.PI) / 360);
      const byHeight = size.z / 2 / (tanHalf * HOME_HEIGHT_RATIO);
      const projectedWidth = size.x * Math.cos(HOME_AZIMUTH) + size.y * Math.sin(HOME_AZIMUTH);
      const byWidth =
        projectedWidth / 2 / (tanHalf * HOME_WIDTH_RATIO * Math.max(camera.aspect, 0.5));
      const distance = Math.max(byHeight, byWidth);
      camera.position.set(
        center.x - distance * Math.sin(HOME_AZIMUTH),
        center.y - distance * Math.cos(HOME_AZIMUTH),
        center.z,
      );
      controls.target.copy(center);
      controls.minDistance = distance / 4;
      controls.maxDistance = distance * 6;
      controls.update();
      renderer.render(scene, camera);
    }

    /** 缓冲跟随容器与设备像素比；没被用户移动过时顺带重算机位，侧栏开合不会裁掉心脏。 */
    function resize(): void {
      const node = hostRef.current;
      if (!node) return;
      const width = Math.max(1, node.clientWidth);
      const height = Math.max(1, node.clientHeight);
      const dpr = window.devicePixelRatio || 1;
      renderer.setPixelRatio(Math.max(0.5, Math.min(dpr, MAX_BUFFER / Math.max(width, height))));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      if (!ready) return;
      if (userMoved) renderer.render(scene, camera);
      else frameHome();
    }

    const homeSpotTarget = new THREE.Vector3(0, 0, 0);
    const focusTargets = new Map<string, THREE.Vector3>();
    const tweenFrom = new THREE.Vector3();
    const tweenTo = new THREE.Vector3();
    let tweenFromAngle = SPOT_ANGLE;
    let tweenToAngle = SPOT_ANGLE;
    let tweenStart = 0;
    let tweenFrame = 0;
    let spotOn = true;
    let lastSelectedId: string | null = null;
    let turnFrame = 0;
    let spinFrom = 0;
    let spinTo = 0;
    let spinStart = 0;
    let turnAngleFrom = SPOT_ANGLE;
    let turnTarget: THREE.Vector3 | null = null;

    function paintFollow(): void {
      renderer.render(scene, camera);
    }

    function followFrame(now: number): void {
      const k = Math.min(1, (now - tweenStart) / FOLLOW_MS);
      const eased = k * k * (3 - 2 * k);
      spot.target.position.lerpVectors(tweenFrom, tweenTo, eased);
      spot.angle = tweenFromAngle + (tweenToAngle - tweenFromAngle) * eased;
      paintFollow();
      if (k < 1) tweenFrame = requestAnimationFrame(followFrame);
    }

    /** 选中结构时把光心移向它的包围盒中心并收窄锥角；减弱动效时一步到位。 */
    function aimSpot(id: string | null): void {
      const focus = id ? focusTargets.get(id) : undefined;
      // 心脏转过之后，光心也要按同一个绕 z 的转角跟过去。
      const to = focus ? focus.clone().applyAxisAngle(Z_AXIS, root.rotation.z) : homeSpotTarget;
      const angle = focus ? SPOT_FOLLOW_ANGLE : SPOT_ANGLE;
      cancelAnimationFrame(tweenFrame);
      if (!spotOn) return;
      if (prefersReducedMotion()) {
        spot.target.position.copy(to);
        spot.angle = angle;
        paintFollow();
        return;
      }
      tweenFrom.copy(spot.target.position);
      tweenTo.copy(to);
      tweenFromAngle = spot.angle;
      tweenToAngle = angle;
      tweenStart = performance.now();
      tweenFrame = requestAnimationFrame(followFrame);
    }

    /** 转到正面的过程中，光心贴着部件走，锥角同步收窄，停下时已经打好光。 */
    function turnStep(now: number): void {
      const k = Math.min(1, (now - spinStart) / TURN_MS);
      const eased = k * k * (3 - 2 * k);
      root.rotation.z = spinFrom + (spinTo - spinFrom) * eased;
      if (spotOn) {
        spot.angle = turnAngleFrom + (SPOT_FOLLOW_ANGLE - turnAngleFrom) * eased;
        if (turnTarget) {
          spot.target.position.copy(turnTarget).applyAxisAngle(Z_AXIS, root.rotation.z);
        }
      }
      renderer.render(scene, camera);
      if (k < 1) turnFrame = requestAnimationFrame(turnStep);
    }

    /** 让整颗心脏绕解剖上下轴转到该部件正对相机；追光一起结束在部件中心。 */
    function turnTo(id: string | null): void {
      if (!ready || !id) return;
      const focus = focusTargets.get(id);
      if (!focus) return;
      const cameraDir = new THREE.Vector3().subVectors(camera.position, controls.target);
      const angle = faceTurnAngle(
        { x: focus.x, y: focus.y },
        { x: cameraDir.x, y: cameraDir.y },
        root.rotation.z,
      );
      if (angle === null) return;
      cancelAnimationFrame(tweenFrame);
      cancelAnimationFrame(turnFrame);
      if (Math.abs(angle - root.rotation.z) < 1e-3) {
        aimSpot(id);
        return;
      }
      turnTarget = focus;
      if (prefersReducedMotion()) {
        root.rotation.z = angle;
        if (spotOn) {
          spot.target.position.copy(focus).applyAxisAngle(Z_AXIS, angle);
          spot.angle = SPOT_FOLLOW_ANGLE;
        }
        renderer.render(scene, camera);
        return;
      }
      spinFrom = root.rotation.z;
      spinTo = angle;
      turnAngleFrom = spot.angle;
      spinStart = performance.now();
      turnFrame = requestAnimationFrame(turnStep);
    }

    function setSpotlight(enabled: boolean): void {
      if (enabled === spotOn) return;
      spotOn = enabled;
      spot.intensity = enabled ? SPOT_INTENSITY : 0;
      // 关灯时换回更柔和的整体照明，保留可读性，只是失去舞台明暗关系。
      ambient.intensity = enabled ? SPOT_AMBIENT : 1.7;
      rim.intensity = enabled ? 0.45 : 1.2;
      dust.visible = enabled;
      if (enabled) aimSpot(lastSelectedId);
      else paintFollow();
    }

    function applySelection(id: string | null): void {
      lastSelectedId = id;
      for (const [structureId, list] of materials) {
        const base = baseColors.get(structureId) ?? "#ffffff";
        const tint = partColor(id, structureId, base);
        for (const material of list) material.color.set(tint);
      }
      // 透显只服务当前选中的结构：未选中时所有副本隐藏，画面仍是纯不透明黏土。
      for (const [structureId, list] of ghosts) {
        const on = id === structureId;
        for (const ghost of list) ghost.visible = on;
      }
      aimSpot(id);
      renderer.render(scene, camera);
    }

    apiRef.current = {
      dolly: (factor: number) => {
        userMoved = true;
        camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);
        controls.update();
        renderer.render(scene, camera);
      },
      reset: () => {
        userMoved = false;
        cancelAnimationFrame(turnFrame);
        root.rotation.z = 0;
        if (spotOn) aimSpot(lastSelectedId);
        frameHome();
      },
      applySelection,
      turnTo,
      setPulse,
      setSpotlight,
    };

    const observer = new ResizeObserver(() => resize());
    observer.observe(host);
    resize();

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
      if (event.buttons & 1 && !isTap(event.clientX - downX, event.clientY - downY)) {
        userMoved = true;
      }
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
            // 高金属度在体素台阶上会铺白色高光，把中饱和的色卡冲淡成马卡龙色。
            roughness: 0.9,
            metalness: 0,
            // GLB 存的是平均法线；平直着色让每个台阶面读出清晰棱面，和体素风一致。
            flatShading: true,
            side: THREE.DoubleSide,
          });
          const meshes: THREE.Mesh[] = [];
          part.traverse((child) => {
            if (child.type !== "Mesh") return;
            const mesh = child as THREE.Mesh;
            mesh.material = material;
            mesh.userData.structureId = structure.id;
            mesh.castShadow = true;
            meshes.push(mesh);
          });
          // 透显副本：同几何再画一遍，只保留被其他结构挡住的部分。
          // GreaterDepth 排除可见面（等深度不算更远），单面剔除避免背面把自身可见区罩上一层色。
          const ghostMaterial = new THREE.MeshBasicMaterial({
            color: focusedColor(structure.color),
            transparent: true,
            opacity: 0.38,
            depthWrite: false,
            depthFunc: THREE.GreaterDepth,
            side: THREE.FrontSide,
          });
          const ghostMeshes: THREE.Mesh[] = [];
          for (const mesh of meshes) {
            const ghost = new THREE.Mesh(mesh.geometry, ghostMaterial);
            ghost.position.copy(mesh.position);
            ghost.quaternion.copy(mesh.quaternion);
            ghost.scale.copy(mesh.scale);
            ghost.visible = false;
            ghost.userData.structureId = structure.id;
            ghostMeshes.push(ghost);
            mesh.parent?.add(ghost);
          }
          ghostMaterials.set(structure.id, ghostMaterial);
          ghosts.set(structure.id, ghostMeshes);
          materials.set(structure.id, [material]);
          baseColors.set(structure.id, structure.color);
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
        baseScale = scale;
        baseCenter.copy(center);
        // 每个结构记一片受光目标：追光按各自包围盒中心移动，才照得准具体心房/心室。
        root.updateMatrixWorld(true);
        for (const { structure, part } of parts) {
          const partBox = new THREE.Box3().setFromObject(part);
          if (!partBox.isEmpty()) {
            focusTargets.set(structure.id, partBox.getCenter(new THREE.Vector3()));
          }
        }
        ready = true;
        resize();
        // 颜色交给下面那个 effect：status 翻到 ready 会再跑一次，这里不碰 selectedId。
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
      pulseOn = false;
      cancelAnimationFrame(pulseFrame);
      cancelAnimationFrame(tweenFrame);
      cancelAnimationFrame(turnFrame);
      apiRef.current = null;
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      controls.dispose();
      dispose(scene);
      renderer.dispose();
      host.replaceChildren();
    };
    // selectedId 只影响材质颜色，走下面那个 effect；把它放进依赖会让每次选中都重载 9 个 GLB。
  }, [structures, supported]);

  useEffect(() => {
    apiRef.current?.applySelection(selectedId);
    apiRef.current?.setPulse(pulseEnabled);
    apiRef.current?.setSpotlight(spotEnabled);
  }, [selectedId, pulseEnabled, spotEnabled, status]);

  // 只在用户从索引（含编号搜索）点选时转向；3D 里点部件保持当前机位。
  useEffect(() => {
    if (status.kind !== "ready" || !turn) return;
    apiRef.current?.turnTo(turn.id);
  }, [turn, status]);

  const hovered = structures.find((s) => s.id === hoveredId) ?? null;
  const selected = structures.find((s) => s.id === selectedId) ?? null;
  // WebGL 不可用或部件加载失败时，用体积最大的结构做一张冠状位静态图兜底，避免留一块空黑区。
  const hero = useMemo(
    () =>
      structures.reduce<StructureRecord | null>(
        (best, item) => (!best || item.stats.voxels > best.stats.voxels ? item : best),
        null,
      ),
    [structures],
  );
  const degraded = !supported || status.kind === "failed";

  return (
    <section className="heart-viewer" aria-labelledby="heart-heading">
      <h2 id="heart-heading">心脏整体形态</h2>
      <p className="heart-help">
        拖拽旋转，滚轮缩放；把鼠标放到部件上显示名称，单击部件即选中该结构。从左侧索引点选结构时，
        整颗心脏会转到该部件正对相机并在该处打光。心脏以约 72
        次/分的节律轻微搏动，可随时暂停或恢复。{structures.length}{" "}
        个部件来自同一份标注体素，颜色与三视图高亮一致。
      </p>

      {!supported && (
        <p role="status" className="heart-status">
          {NO_WEBGL}
        </p>
      )}

      {supported && (
        <>
          <div ref={hostRef} className="heart-host" hidden={status.kind === "failed"} />
          <p role="status" className="heart-status">
            {status.kind === "loading" && `正在合成整颗心脏：载入 ${structures.length} 个部件…`}
            {status.kind === "ready" && hovered && `悬停：${hovered.name}（${hovered.en_name}）`}
            {status.kind === "ready" &&
              !hovered &&
              selected &&
              `已高亮 ${selected.name}，其余部件压暗显示。`}
            {status.kind === "ready" &&
              !hovered &&
              !selected &&
              !hintDismissed &&
              "单击心脏部件查看说明；拖拽旋转，滚轮缩放。"}
            {status.kind === "failed" && status.reason}
          </p>
          {status.kind !== "failed" && (
            <div className="heart-buttons" role="toolbar" aria-label="3D 视图控制">
              <button
                type="button"
                aria-label="放大"
                title="放大"
                onClick={() => apiRef.current?.dolly(0.8)}
              >
                <ToolIcon d="M12 5v14M5 12h14" />
              </button>
              <button
                type="button"
                aria-label="缩小"
                title="缩小"
                onClick={() => apiRef.current?.dolly(1.25)}
              >
                <ToolIcon d="M5 12h14" />
              </button>
              <button
                type="button"
                aria-label="复位视角"
                title="复位视角"
                onClick={() => apiRef.current?.reset()}
              >
                <ToolIcon d="M4 11a8 8 0 1 1 2.34 5.66M4 5v6h6" />
              </button>
              <button
                type="button"
                aria-pressed={pulseEnabled}
                aria-label={pulseEnabled ? "暂停跳动" : "恢复跳动"}
                title={pulseEnabled ? "暂停跳动" : "恢复跳动"}
                onClick={() => setPulseEnabled((enabled) => !enabled)}
              >
                <ToolIcon d={pulseEnabled ? "M9 5v14M15 5v14" : "M8 5l11 7-11 7z"} />
              </button>
              <button
                type="button"
                aria-pressed={spotEnabled}
                aria-label={spotEnabled ? "关闭舞台聚光灯" : "打开舞台聚光灯"}
                title={spotEnabled ? "关闭舞台聚光灯" : "打开舞台聚光灯"}
                onClick={() => setSpotlightEnabled((enabled) => !enabled)}
              >
                <ToolIcon d="M12 3 6 20h12L12 3zM12 3v3" />
              </button>
            </div>
          )}
        </>
      )}

      {degraded && hero && (
        <figure className="heart-fallback">
          <div className="heart-fallback-stack">
            <img
              src={`/${hero.views.coronal.base}`}
              alt={`${hero.name}的冠状位示意切面，代替整体 3D 视图`}
              width={288}
              height={288}
            />
            <img
              src={`/${hero.views.coronal.overlay}`}
              alt=""
              aria-hidden="true"
              width={288}
              height={288}
            />
          </div>
          <figcaption>
            3D 暂时无法显示，先用体积最大的结构「{hero.name}
            」的冠状位切面代替；三视图与信息卡不受影响。
          </figcaption>
        </figure>
      )}
    </section>
  );
}

/** 浮尘：灯位到心脏的一带均匀撒一把静态微粒。 */
function makeDust(apex: THREE.Vector3, target: THREE.Vector3, angle: number): THREE.Points {
  const count = 54;
  const dir = new THREE.Vector3().subVectors(target, apex);
  const length = Math.max(dir.length(), 1e-3);
  dir.normalize();
  const side = new THREE.Vector3(0, 0, 1).cross(dir).normalize();
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
  const up = new THREE.Vector3().crossVectors(dir, side).normalize();
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const t = 0.15 + Math.random() * 0.85;
    const radius = Math.tan(angle) * length * t * Math.sqrt(Math.random()) * 0.8;
    const phi = Math.random() * Math.PI * 2;
    const point = apex
      .clone()
      .addScaledVector(dir, t * length)
      .addScaledVector(side, Math.cos(phi) * radius)
      .addScaledVector(up, Math.sin(phi) * radius);
    positions.set([point.x, point.y, point.z], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0xffe3bd,
      map: softDot(),
      size: 0.026,
      transparent: true,
      opacity: 0.55,
      alphaTest: 0.02,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );
}

/** 浮尘用的小圆点：径向渐变贴图，避免默认方块像素点像坏点。 */
function softDot(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.4, "rgba(255,255,255,0.45)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 32, 32);
  }
  return new THREE.CanvasTexture(canvas);
}

function ToolIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** GLB 与场景对象都要显式释放：来回切结构不释放会一路累积 GPU 资源。 */
function dispose(root: THREE.Object3D): void {
  root.traverse((child) => {
    // 光锥和浮尘分别是 Mesh 与 Points，都要连同贴图一起释放。
    if (child.type !== "Mesh" && child.type !== "Points") return;
    const mesh = child as THREE.Mesh;
    mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const basic = material as THREE.MeshBasicMaterial;
      basic.alphaMap?.dispose();
      basic.map?.dispose();
      material.dispose();
    }
  });
}
