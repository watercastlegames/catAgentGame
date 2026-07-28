"use client";

import { useEffect, useState } from "react";
import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { CAT_STYLES, catStyleModelUrl } from "../cat-styles";

/**
 * 조사용 페이지 — 스타일 15종의 메시가 정말 같은지 실측한다.
 * `chrome --headless --dump-dom` 으로 결과 표를 그대로 긁어 갈 수 있다.
 */
type Row = {
  id: string;
  vertices: number;
  triangles: number;
  bones: number;
  morphs: number;
  size: string;
  positionHash: string;
  extra?: string;
};

function hashPositions(attribute: THREE.BufferAttribute) {
  // 정점 좌표 전체를 훑어 32비트로 접는다 — 같은 메시면 같은 값이 나온다.
  const array = attribute.array as ArrayLike<number>;
  let hash = 2166136261;
  for (let index = 0; index < array.length; index += 1) {
    const value = Math.round(array[index] * 1000);
    hash ^= value;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export default function CatInspectPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let disposed = false;
    const loader = new FBXLoader();

    async function run() {
      const collected: Row[] = [];
      for (const style of CAT_STYLES) {
        try {
          const model = await loader.loadAsync(catStyleModelUrl(style.id));
          if (disposed) return;
          let vertices = 0;
          let triangles = 0;
          let morphs = 0;
          let positionHash = "";
          const bones = new Set<string>();
          model.traverse((object) => {
            if (object instanceof THREE.Bone) bones.add(object.name);
            if (!(object instanceof THREE.Mesh)) return;
            const geometry = object.geometry as THREE.BufferGeometry;
            const position = geometry.getAttribute(
              "position",
            ) as THREE.BufferAttribute;
            vertices += position.count;
            triangles += geometry.index
              ? geometry.index.count / 3
              : position.count / 3;
            morphs += geometry.morphAttributes.position?.length ?? 0;
            positionHash += hashPositions(position);
          });
          model.updateMatrixWorld(true);
          const size = new THREE.Box3()
            .setFromObject(model)
            .getSize(new THREE.Vector3());
          collected.push({
            id: style.id,
            vertices,
            triangles: Math.round(triangles),
            bones: bones.size,
            morphs,
            size: `${size.x.toFixed(3)} x ${size.y.toFixed(3)} x ${size.z.toFixed(3)}`,
            positionHash,
          });
        } catch (error) {
          collected.push({
            id: style.id,
            vertices: 0,
            triangles: 0,
            bones: 0,
            morphs: 0,
            size: "-",
            positionHash: "-",
            extra: String(error),
          });
        }
        if (!disposed) setRows([...collected]);
      }
      if (!disposed) setDone(true);
    }

    void run();
    return () => {
      disposed = true;
    };
  }, []);

  const [probe, setProbe] = useState("");
  useEffect(() => {
    let disposed = false;
    const loader = new FBXLoader();
    async function run() {
      const lines: string[] = [];
      for (let index = 1; index <= 5; index += 1) {
        const url = `/models/_probe/Cat_${index}.fbx`;
        try {
          const model = await loader.loadAsync(url);
          if (disposed) return;
          let vertices = 0;
          let uv = false;
          const bones = new Set<string>();
          const materials = new Set<string>();
          const colors = new Set<string>();
          model.traverse((object) => {
            if (object instanceof THREE.Bone) bones.add(object.name);
            if (!(object instanceof THREE.Mesh)) return;
            const geometry = object.geometry as THREE.BufferGeometry;
            vertices += geometry.getAttribute("position").count;
            if (geometry.getAttribute("uv")) uv = true;
            for (const material of Array.isArray(object.material)
              ? object.material
              : [object.material]) {
              materials.add(material.type);
              const withColor = material as THREE.Material & {
                color?: THREE.Color;
                map?: THREE.Texture | null;
              };
              colors.add(
                `${withColor.color ? `#${withColor.color.getHexString()}` : "-"}${withColor.map ? "+map" : ""}`,
              );
            }
          });
          model.updateMatrixWorld(true);
          const size = new THREE.Box3()
            .setFromObject(model)
            .getSize(new THREE.Vector3());
          lines.push(
            `Cat_${index} verts=${vertices} bones=${bones.size} clips=${model.animations.length} uv=${uv} materials=${[...materials].join("/")} color=${[...colors].join("/")} size=${size.x.toFixed(2)}x${size.y.toFixed(2)}x${size.z.toFixed(2)} ratio(W/H)=${(size.x / size.y).toFixed(2)}`,
          );
        } catch (error) {
          lines.push(`Cat_${index} ERROR ${String(error)}`);
        }
        if (!disposed) setProbe(lines.join("\n"));
      }
    }
    void run();
    return () => {
      disposed = true;
    };
  }, []);

  const [rig, setRig] = useState("");
  useEffect(() => {
    let disposed = false;
    const loader = new FBXLoader();
    void Promise.all([
      loader.loadAsync(catStyleModelUrl("Blue")),
      loader.loadAsync(
        "/models/PolyArt/Animals/Cats/FBX/Lowpoly_Cat_Animations_IP.fbx",
      ),
    ]).then(([model, animationSource]) => {
      if (disposed) return;
      const bones: string[] = [];
      model.traverse((object) => {
        if (object instanceof THREE.Bone) bones.push(object.name);
      });
      const suffixes = new Map<string, number>();
      for (const clip of animationSource.animations) {
        for (const track of clip.tracks) {
          const suffix = track.name.slice(track.name.lastIndexOf("."));
          suffixes.set(suffix, (suffixes.get(suffix) ?? 0) + 1);
        }
      }
      const scaleTracks = animationSource.animations
        .flatMap((clip) => clip.tracks)
        .filter((track) => track.name.endsWith(".scale"));
      setRig(
        [
          `clips=${animationSource.animations.length}`,
          `trackKinds=${[...suffixes]
            .map(([suffix, count]) => `${suffix}:${count}`)
            .join(" ")}`,
          `scaleTrackSample=${scaleTracks[0]?.name ?? "(none)"}`,
          `bones(${bones.length})=${bones.join(",")}`,
        ].join("\n"),
      );
    });
    return () => {
      disposed = true;
    };
  }, []);

  const hashes = new Set(rows.map((row) => row.positionHash));

  return (
    <main style={{ padding: 20, fontFamily: "ui-monospace, Consolas, monospace" }}>
      <h1 id="status">{done ? "INSPECT-DONE" : "INSPECT-RUNNING"}</h1>
      <p id="summary">
        {`styles=${rows.length} distinctMeshHashes=${hashes.size}`}
      </p>
      <pre id="probe" style={{ whiteSpace: "pre-wrap", maxWidth: 1450 }}>
        {probe}
      </pre>
      <pre id="rig" style={{ whiteSpace: "pre-wrap", maxWidth: 1400 }}>
        {rig}
      </pre>
      <pre id="report">
        {rows
          .map(
            (row) =>
              `${row.id.padEnd(12)} verts=${String(row.vertices).padStart(6)} tris=${String(
                row.triangles,
              ).padStart(6)} bones=${String(row.bones).padStart(3)} morphs=${row.morphs} size=${row.size} hash=${row.positionHash.slice(0, 16)}${row.extra ? ` ERROR=${row.extra}` : ""}`,
          )
          .join("\n")}
      </pre>
    </main>
  );
}
