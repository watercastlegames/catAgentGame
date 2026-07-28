"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { OutlineEffect } from "three/addons/effects/OutlineEffect.js";
import { CAT_STYLES, catStyleModelUrl } from "./cat-styles";

/** PolyArt 고양이 팩의 스타일 전부를 한 화면에 세워 두는 진열대. */
const ILLUSTRATION_OUTLINE_COLOR = new THREE.Color(0x6f5040);
const ILLUSTRATION_OUTLINE_THICKNESS = 0.005;
const ILLUSTRATION_OUTLINE_ALPHA = 0.8;
const GALLERY_COLUMNS = 5;
// 꼬리까지 치면 고양이 한 마리가 1.5쯤 되고, 제자리에서 돌기까지 하니 열 간격은 넉넉해야 한다.
const CELL_WIDTH = 1.8;
// 카메라가 45°쯤에서 내려다보므로 줄 간격(z)은 화면에서 sin(45°)만큼만 벌어진다.
// 고양이 키 0.86 + 이름표까지 겹치지 않으려면 2.2 는 있어야 한다.
const CELL_DEPTH = 2.2;
const CAT_HEIGHT = 0.86;
const TURNTABLE_SPEED = 0.42;
const FRAME_MARGIN = 1.06;
// 이름표는 어떤 외곽선보다 위에 떠야 한다. 월드와 같은 방식 —
// 전용 레이어로 빼서 외곽선 패스가 끝난 뒤 깊이를 비우고 따로 그린다.
const WORLD_LAYER = 0;
const LABEL_OVERLAY_LAYER = 1;
const LABEL_RENDER_ORDER = 240;

function createLabel(text: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "rgba(251, 241, 213, 0.96)";
    context.strokeStyle = "#816553";
    context.lineWidth = 8;
    context.beginPath();
    context.roundRect(8, 8, 368, 80, 22);
    context.fill();
    context.stroke();
    context.fillStyle = "#4d4038";
    context.font = "700 36px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, 192, 49);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.02,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  material.userData.outlineParameters = { visible: false };
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.23), material);
  label.renderOrder = LABEL_RENDER_ORDER;
  label.layers.set(LABEL_OVERLAY_LAYER);
  return { label, texture };
}

export default function CatStyleGallery() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const [webglFailed, setWebglFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      queueMicrotask(() => setWebglFailed(true));
      return;
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.domElement.className = "cat-gallery-canvas";
    host.appendChild(renderer.domElement);

    const outlineEffect = new OutlineEffect(renderer, {
      defaultThickness: ILLUSTRATION_OUTLINE_THICKNESS,
      defaultColor: ILLUSTRATION_OUTLINE_COLOR.toArray(),
      defaultAlpha: ILLUSTRATION_OUTLINE_ALPHA,
    });

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4ead8);
    scene.add(new THREE.HemisphereLight(0xfff6dd, 0x8d7a68, 1.7));
    const keyLight = new THREE.DirectionalLight(0xfff2d1, 2.1);
    keyLight.position.set(-4, 10, 7);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x9fcbe0, 0.65);
    fillLight.position.set(8, 5, -4);
    scene.add(fillLight);

    const rows = Math.ceil(CAT_STYLES.length / GALLERY_COLUMNS);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 80);
    camera.position.set(0, 8.6, 8.6);
    camera.lookAt(0, 0.4, 0);
    camera.updateMatrixWorld(true);

    const turntables: THREE.Group[] = [];
    const disposables: Array<{ dispose: () => void }> = [];

    const pedestalGeometry = new THREE.CylinderGeometry(0.52, 0.52, 0.09, 28);
    const pedestalMaterial = new THREE.MeshStandardMaterial({
      color: 0xe4d6bd,
      roughness: 1,
      metalness: 0,
    });
    disposables.push(pedestalGeometry, pedestalMaterial);

    CAT_STYLES.forEach((style, index) => {
      const column = index % GALLERY_COLUMNS;
      const row = Math.floor(index / GALLERY_COLUMNS);
      const cell = new THREE.Group();
      cell.position.set(
        (column - (GALLERY_COLUMNS - 1) / 2) * CELL_WIDTH,
        0,
        (row - (rows - 1) / 2) * CELL_DEPTH,
      );
      const pedestal = new THREE.Mesh(pedestalGeometry, pedestalMaterial);
      pedestal.position.y = 0.045;
      cell.add(pedestal);

      const turntable = new THREE.Group();
      turntable.position.y = 0.09;
      // 같은 각도로 다 같이 도는 것보다 조금씩 어긋나 도는 편이 살아 보인다.
      turntable.rotation.y = index * 0.4;
      cell.add(turntable);
      turntables.push(turntable);

      const { label, texture } = createLabel(style.id);
      label.position.set(0, 1.16, 0);
      // 카메라가 고정이라 한 번만 맞춰 두면 계속 정면으로 보인다.
      label.quaternion.copy(camera.quaternion);
      cell.add(label);
      disposables.push(texture, label.geometry, label.material);

      scene.add(cell);
    });

    // 격자 전체(이름표 포함)를 카메라 공간으로 넣어 보고 딱 맞는 직교 프러스텀을 만든다.
    // 모델이 하나씩 도착할 때마다 다시 재면 로딩 도중에도 화면이 안 잘린다.
    const frameCamera = () => {
      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      renderer.setSize(width, height, false);
      const aspect = width / height;
      const bounds = new THREE.Box3().setFromObject(scene);
      if (bounds.isEmpty()) return;
      const corner = new THREE.Vector3();
      let halfW = 0.001;
      let halfH = 0.001;
      for (let index = 0; index < 8; index += 1) {
        corner.set(
          index & 1 ? bounds.max.x : bounds.min.x,
          index & 2 ? bounds.max.y : bounds.min.y,
          index & 4 ? bounds.max.z : bounds.min.z,
        );
        corner.applyMatrix4(camera.matrixWorldInverse);
        halfW = Math.max(halfW, Math.abs(corner.x));
        halfH = Math.max(halfH, Math.abs(corner.y));
      }
      halfW *= FRAME_MARGIN;
      halfH *= FRAME_MARGIN;
      if (halfW / halfH < aspect) halfW = halfH * aspect;
      else halfH = halfW / aspect;
      camera.left = -halfW;
      camera.right = halfW;
      camera.top = halfH;
      camera.bottom = -halfH;
      camera.updateProjectionMatrix();
    };
    frameCamera();
    const resizeObserver = new ResizeObserver(frameCamera);
    resizeObserver.observe(host);

    const textureLoader = new THREE.TextureLoader();
    // FBXLoader 는 flipY 를 건드리지 않는다 — 팩에 딸린 텍스처와 같은 기본값을 쓴다.
    const paletteTexture = textureLoader.load(
      "/models/PolyArt/Animals/Cats/Texture/PolyArt_Cats_color.png",
    );
    paletteTexture.colorSpace = THREE.SRGBColorSpace;
    disposables.push(paletteTexture);

    const fbxLoader = new FBXLoader();
    CAT_STYLES.forEach((style, index) => {
      fbxLoader
        .loadAsync(catStyleModelUrl(style.id))
        .then((model) => {
          if (disposed) return;
          model.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            object.castShadow = false;
            object.receiveShadow = false;
            const materials = Array.isArray(object.material)
              ? object.material
              : [object.material];
            for (const material of materials) {
              if (
                material instanceof THREE.MeshStandardMaterial ||
                material instanceof THREE.MeshPhongMaterial
              ) {
                material.color.set(0xffffff);
                if (!material.map) material.map = paletteTexture;
                if (material.map) {
                  material.map.colorSpace = THREE.SRGBColorSpace;
                }
              }
              material.userData.outlineParameters = {
                thickness: ILLUSTRATION_OUTLINE_THICKNESS,
                color: ILLUSTRATION_OUTLINE_COLOR.toArray(),
                alpha: ILLUSTRATION_OUTLINE_ALPHA,
              };
              material.needsUpdate = true;
            }
          });

          model.updateMatrixWorld(true);
          const sourceSize = new THREE.Box3()
            .setFromObject(model)
            .getSize(new THREE.Vector3());
          model.scale.setScalar(CAT_HEIGHT / Math.max(sourceSize.y, 0.001));
          model.updateMatrixWorld(true);
          const scaledBounds = new THREE.Box3().setFromObject(model);
          model.position.y = -scaledBounds.min.y;
          turntables[index]?.add(model);
          frameCamera();
          setLoaded((current) => current + 1);
        })
        .catch(() => {
          if (disposed) return;
          setFailed((current) => [...current, style.id]);
        });
    });

    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 0.1);
      turntables.forEach((turntable) => {
        turntable.rotation.y += delta * TURNTABLE_SPEED;
      });

      camera.layers.set(WORLD_LAYER);
      outlineEffect.render(scene, camera);
      // 이름표 오버레이 패스 — 외곽선까지 끝난 뒤에 깊이를 비우고 이름표만 그린다.
      const previousBackground = scene.background;
      const previousAutoClear = renderer.autoClear;
      camera.layers.set(LABEL_OVERLAY_LAYER);
      scene.background = null;
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(scene, camera);
      scene.background = previousBackground;
      renderer.autoClear = previousAutoClear;
      camera.layers.set(WORLD_LAYER);
    });

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach((material) => material.dispose());
      });
      disposables.forEach((item) => item.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className="cat-gallery">
      <div className="cat-gallery-stage" ref={hostRef}>
        {loaded < CAT_STYLES.length && !webglFailed && (
          <p className="cat-gallery-progress">
            고양이 스타일 불러오는 중 · {loaded}/{CAT_STYLES.length}
          </p>
        )}
        {webglFailed && (
          <p className="cat-gallery-progress">
            이 브라우저에서는 3D를 켤 수 없어 아래 목록만 표시합니다.
          </p>
        )}
      </div>
      {failed.length > 0 && (
        <p className="cat-gallery-failed">
          불러오지 못한 스타일: {failed.join(", ")}
        </p>
      )}
      <ol className="cat-gallery-list">
        {CAT_STYLES.map((style) => (
          <li key={style.id}>
            <b>{style.id}</b>
            <span>{style.ko}</span>
            <code>{catStyleModelUrl(style.id)}</code>
          </li>
        ))}
      </ol>
    </div>
  );
}
