"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OutlineEffect } from "three/addons/effects/OutlineEffect.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const OUTLINE_COLOR = new THREE.Color(0x765b4c);
const WORLD_OUTLINE_COLOR = new THREE.Color(0x735b4f);

export default function WorkstationShotPage() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const params = new URLSearchParams(window.location.search);
    const url =
      params.get("url") ??
      "/models/validation/low-monitor-segmentation-preview-v1.glb";
    const yaw = Number(params.get("yaw") ?? "0") || 0;
    const pitch = Number(params.get("pitch") ?? "0") || 0;
    const useFrontView = params.get("view") === "front";
    const useOutline = params.get("outline") === "1";
    const useWorldStyle = params.get("worldStyle") === "1";
    const tintParameter = params.get("tint");
    const tint =
      tintParameter && /^[0-9a-f]{6}$/i.test(tintParameter)
        ? new THREE.Color(Number.parseInt(tintParameter, 16))
        : null;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = useWorldStyle
      ? THREE.NeutralToneMapping
      : THREE.NoToneMapping;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0xf4eee3, 1);
    host.appendChild(renderer.domElement);

    const outlineEffect = new OutlineEffect(renderer, {
      defaultThickness: useWorldStyle ? 0.0038 : 0.004,
      defaultColor: (
        useWorldStyle ? WORLD_OUTLINE_COLOR : OUTLINE_COLOR
      ).toArray(),
      defaultAlpha: useWorldStyle ? 0.72 : 0.86,
    });
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff7df, 0x8f806f, 2));
    const keyLight = new THREE.DirectionalLight(0xfff1cf, 2);
    keyLight.position.set(-4, 8, 6);
    scene.add(keyLight);

    const pivot = new THREE.Group();
    pivot.rotation.set(pitch, yaw, 0);
    scene.add(pivot);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 50);
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    let modelBounds: THREE.Box3 | null = null;

    const frame = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      renderer.setSize(width, height, false);
      if (!modelBounds) return;
      pivot.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(pivot);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      if (useFrontView) {
        const cameraDistance = Math.max(size.x, size.y, size.z) * 4 + 1;
        camera.position.set(center.x, center.y, center.z + cameraDistance);
        camera.lookAt(center);
      } else {
        camera.position.set(
          center.x + size.x * 1.45,
          center.y + size.y * 1.2,
          center.z + size.z * 1.9,
        );
        camera.lookAt(center.x, center.y + size.y * 0.05, center.z);
      }
      camera.updateMatrixWorld(true);

      const corners = [
        [bounds.min.x, bounds.min.y, bounds.min.z],
        [bounds.max.x, bounds.min.y, bounds.min.z],
        [bounds.min.x, bounds.max.y, bounds.min.z],
        [bounds.max.x, bounds.max.y, bounds.min.z],
        [bounds.min.x, bounds.min.y, bounds.max.z],
        [bounds.max.x, bounds.min.y, bounds.max.z],
        [bounds.min.x, bounds.max.y, bounds.max.z],
        [bounds.max.x, bounds.max.y, bounds.max.z],
      ];
      let halfWidth = 0.01;
      let halfHeight = 0.01;
      for (const values of corners) {
        const point = new THREE.Vector3(...values).applyMatrix4(
          camera.matrixWorldInverse,
        );
        halfWidth = Math.max(halfWidth, Math.abs(point.x));
        halfHeight = Math.max(halfHeight, Math.abs(point.y));
      }
      halfWidth *= 1.16;
      halfHeight *= 1.16;
      const aspect = width / height;
      if (halfWidth / halfHeight < aspect) halfWidth = halfHeight * aspect;
      else halfHeight = halfWidth / aspect;
      camera.left = -halfWidth;
      camera.right = halfWidth;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();
    };

    void loader.loadAsync(url).then((gltf) => {
      if (disposed) return;
      gltf.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) {
          if (
            tint &&
            (material instanceof THREE.MeshStandardMaterial ||
              material instanceof THREE.MeshPhysicalMaterial ||
              material instanceof THREE.MeshBasicMaterial ||
              material instanceof THREE.MeshToonMaterial)
          ) {
            material.color.multiply(tint);
          }
          if (
            useWorldStyle &&
            (material instanceof THREE.MeshStandardMaterial ||
              material instanceof THREE.MeshPhysicalMaterial)
          ) {
            material.metalness = 0;
            material.roughness = 1;
            material.emissive.set(0x000000);
            material.envMapIntensity = 0;
            material.side = THREE.DoubleSide;
          }
          if ("map" in material && material.map instanceof THREE.Texture) {
            material.map.colorSpace = THREE.SRGBColorSpace;
            material.map.anisotropy =
              renderer.capabilities.getMaxAnisotropy();
          }
          material.userData.outlineParameters = {
            thickness: useWorldStyle ? 0.0038 : 0.004,
            color: (
              useWorldStyle ? WORLD_OUTLINE_COLOR : OUTLINE_COLOR
            ).toArray(),
            alpha: useWorldStyle ? 0.72 : 0.86,
          };
          material.needsUpdate = true;
        }
      });
      pivot.add(gltf.scene);
      gltf.scene.updateMatrixWorld(true);
      modelBounds = new THREE.Box3().setFromObject(gltf.scene);
      frame();
      document.title = "workstation-shot-ready";
    });

    window.addEventListener("resize", frame);
    renderer.setAnimationLoop(() => {
      if (disposed) return;
      if (useOutline) outlineEffect.render(scene, camera);
      else renderer.render(scene, camera);
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
      <style>{`html, body { margin: 0; overflow: hidden; background: #f4eee3; }`}</style>
      <div ref={hostRef} style={{ width: "100vw", height: "100vh" }} />
    </>
  );
}
