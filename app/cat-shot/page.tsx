"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { SketchOutlineEffect } from "../sketch-outline-effect";
import { catStyleModelUrl } from "../cat-styles";
import { fattenCat } from "../cat-body";

/**
 * 검수 문서용 스틸 촬영 페이지 — `?style=Sphynx` 한 마리만, 배경 없이, 창을 꽉 채워 렌더한다.
 * 헤드리스 크로미움으로 15장을 찍어 cat-styles-review-*.html 에 박아 넣는 용도다.
 * 캔버스를 창 크기에 정확히 맞춰야 스크린샷 = 캔버스가 된다.
 */
/* 게임 월드(app/agent-world-3d.tsx)와 같은 값을 쓴다.
   여기서 찍은 그림이 그대로 털색 목록 썸네일이 되므로, 값이 다르면
   목록의 고양이와 사무실의 고양이가 다른 그림처럼 보인다. */
const ILLUSTRATION_OUTLINE_COLOR = new THREE.Color(0x735b4f);
const OUTLINE_THICKNESS = 0.0038;
const OUTLINE_ALPHA = 0.72;
const CAT_HEIGHT = 0.86;
const PORTRAIT_YAW = -0.62;

export default function CatShotPage() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const params = new URLSearchParams(window.location.search);
    const style = params.get("style") ?? "Blue";
    // ?fat=1.35 → 몸통 35% 확대, ?sag=0.7 → 아랫배 처짐, ?legs=0.8 → 다리 20% 단축
    const fat = Number(params.get("fat") ?? "1") || 1;
    const sag = Number(params.get("sag") ?? "0.35");
    const legs = Number(params.get("legs") ?? "1") || 1;
    const modelUrl = params.get("url") ?? catStyleModelUrl(style);
    const textureUrl =
      params.get("tex") ??
      "/models/PolyArt/Animals/Cats/Texture/PolyArt_Cats_color.png";

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.setPixelRatio(2);
    renderer.setClearAlpha(0);
    host.appendChild(renderer.domElement);

    /* 이 페이지는 직교 카메라라 gl_Position.w 가 늘 1 이다.
       월드(원근)에서는 w 가 깊이라 같은 상수라도 화면에서 더 두껍게 나온다.
       그래서 같은 굵기로 보이게 하려면 여기서만 배수를 곱해야 한다.
       ?ot= 로 조절할 수 있게 열어 둔다. */
    const outlineScale = Number(params.get("ot") ?? "3") || 3;
    const outlineEffect = new SketchOutlineEffect(renderer, {
      defaultThickness: OUTLINE_THICKNESS * outlineScale,
      defaultColor: ILLUSTRATION_OUTLINE_COLOR.toArray(),
      defaultAlpha: OUTLINE_ALPHA,
    });

    // 월드가 unlit 이라 여기도 조명을 두지 않는다. 조명을 두면 목록 썸네일만
    // 음영이 생겨 사무실에 서 있는 고양이와 다른 색으로 보인다.
    const scene = new THREE.Scene();

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 40);
    const cameraOffset = new THREE.Vector3(0, 2.7, 6);
    const pivot = new THREE.Group();
    // ?yaw=-1.57 → 옆모습. 배가 처졌는지는 옆에서 봐야 제대로 보인다.
    pivot.rotation.y = Number(params.get("yaw") ?? PORTRAIT_YAW);
    scene.add(pivot);

    // ?half=0.62 → 자동 프레이밍을 끄고 고정 배율로 찍는다.
    // 비교 컷은 이게 필수다. 자동 프레이밍은 살찐 개체를 다시 축소해 차이를 지워 버린다.
    const fixedHalf = Number(params.get("half") ?? "0") || 0;

    // 대상의 바운딩박스 중심을 보게 맞춘 뒤, 그 박스가 딱 들어가는 정사각 프러스텀을 만든다.
    const frame = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      // updateStyle 을 끄면 캔버스가 픽셀비율만큼 커진 채로 CSS 크기가 없어 창을 넘친다.
      renderer.setSize(width, height);
      const bounds = new THREE.Box3().setFromObject(scene);
      if (bounds.isEmpty()) return;
      const center = fixedHalf
        ? new THREE.Vector3(0, CAT_HEIGHT * 0.52, 0)
        : bounds.getCenter(new THREE.Vector3());
      camera.position.copy(center).add(cameraOffset);
      camera.lookAt(center);
      camera.updateMatrixWorld(true);
      const corner = new THREE.Vector3();
      let halfX = 0.001;
      let halfY = 0.001;
      for (let index = 0; index < 8; index += 1) {
        corner.set(
          index & 1 ? bounds.max.x : bounds.min.x,
          index & 2 ? bounds.max.y : bounds.min.y,
          index & 4 ? bounds.max.z : bounds.min.z,
        );
        corner.applyMatrix4(camera.matrixWorldInverse);
        halfX = Math.max(halfX, Math.abs(corner.x));
        halfY = Math.max(halfY, Math.abs(corner.y));
      }
      const aspect = width / height;
      let halfW = fixedHalf || halfX * 1.1;
      let halfH = fixedHalf || halfY * 1.14;
      if (halfW / halfH < aspect) halfW = halfH * aspect;
      else halfH = halfW / aspect;
      camera.left = -halfW;
      camera.right = halfW;
      camera.top = halfH;
      camera.bottom = -halfH;
      camera.updateProjectionMatrix();
    };

    // FBX 안의 텍스처 경로는 브라우저에서 풀리지 않는다 — 팔레트 아틀라스를 직접 물려 준다.
    const paletteTexture = new THREE.TextureLoader().load(textureUrl);
    // 팩마다 UV 원점 규약이 달라 ?flip=0 으로 뒤집어 볼 수 있게 한다.
    if (params.get("flip") === "0") paletteTexture.flipY = false;
    paletteTexture.colorSpace = THREE.SRGBColorSpace;

    // ?anim=Walk_F&t=0.45 → 애니메이션을 그 시각까지 돌린 포즈로 찍는다.
    // 살찌우기가 스키닝을 망가뜨리지 않는지 눈으로 확인하는 용도다.
    const animationName = params.get("anim");
    const animationTime = Number(params.get("t") ?? "0.45") || 0;
    const animationsPromise = animationName
      ? new FBXLoader().loadAsync(
          "/models/PolyArt/Animals/Cats/FBX/Lowpoly_Cat_Animations_IP.fbx",
        )
      : Promise.resolve(null);

    void new FBXLoader().loadAsync(modelUrl).then(async (model) => {
      if (disposed) return;
      if (fat !== 1 || legs !== 1) {
        fattenCat(model, { belly: fat, sag, legs });
      }
      const animationSource = await animationsPromise;
      if (disposed) return;
      if (animationSource) {
        const clip = animationSource.animations.find((candidate) =>
          candidate.name.includes(animationName ?? ""),
        );
        if (clip) {
          const mixer = new THREE.AnimationMixer(model);
          mixer.clipAction(clip).play();
          mixer.update(animationTime);
        }
      }
      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) {
          // FBX 팩마다 재질 종류가 다르다(Phong/Standard/Lambert). map 을 가진 재질이면 모두 갈아끼운다.
          const textured = material as THREE.Material & {
            color?: THREE.Color;
            map?: THREE.Texture | null;
          };
          if ("map" in textured) {
            textured.color?.set(0xffffff);
            if (params.get("tex") || !textured.map) textured.map = paletteTexture;
            if (textured.map) textured.map.colorSpace = THREE.SRGBColorSpace;
          }
          material.userData.outlineParameters = {
            thickness: OUTLINE_THICKNESS * outlineScale,
            color: ILLUSTRATION_OUTLINE_COLOR.toArray(),
            alpha: OUTLINE_ALPHA,
            visible: true,
          };
          material.needsUpdate = true;
        }
        // 조명 없이 텍스처 색 그대로 — 월드와 같은 unlit.
        const unlit = materials.map((material) => {
          const source = material as THREE.Material & {
            color?: THREE.Color;
            map?: THREE.Texture | null;
          };
          const basic = new THREE.MeshBasicMaterial({
            color: source.color?.clone() ?? new THREE.Color(0xffffff),
            map: source.map ?? paletteTexture,
            side: THREE.DoubleSide,
            toneMapped: material.toneMapped,
          });
          basic.userData.outlineParameters = material.userData.outlineParameters;
          return basic;
        });
        object.material = Array.isArray(object.material) ? unlit : unlit[0];
      });
      model.updateMatrixWorld(true);
      const sourceSize = new THREE.Box3()
        .setFromObject(model)
        .getSize(new THREE.Vector3());
      model.scale.setScalar(CAT_HEIGHT / Math.max(sourceSize.y, 0.001));
      model.updateMatrixWorld(true);
      const scaled = new THREE.Box3().setFromObject(model);
      model.position.y = -scaled.min.y;
      pivot.add(model);
      frame();
      // 촬영 스크립트가 준비 완료를 확인할 수 있게 제목에 표시한다.
      document.title = `cat-shot-ready-${style}-${fat}`;
    });

    window.addEventListener("resize", frame);
    renderer.setAnimationLoop(() => {
      if (disposed) return;
      outlineEffect.render(scene, camera);
    });

    return () => {
      disposed = true;
      window.removeEventListener("resize", frame);
      renderer.setAnimationLoop(null);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <>
      <style>{`html, body { margin: 0; padding: 0; background: transparent !important; overflow: hidden; }`}</style>
      <div ref={hostRef} style={{ width: "100vw", height: "100vh" }} />
    </>
  );
}
