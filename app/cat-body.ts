import * as THREE from "three";

/**
 * 고양이 체형을 손보는 함수.
 *
 * PolyArt 팩에는 통통한 체형이 따로 없다(15종 폭 0.130~0.149, 최대 차이 15%).
 * 모프 타깃도 없다(morphs=0). 그래서 체형을 바꾸려면 셋 중 하나인데,
 *
 *   ① 모델 전체 비균등 스케일 → 다리·머리까지 같이 굵어져 "짜부라진" 느낌
 *   ② 뼈 스케일           → 애니메이션 클립 68개가 전부 .scale 트랙을 갖고 있어 매 프레임 덮어씀
 *   ③ 바인드 포즈 정점을 몸통 축 기준으로 부풀리기  ← 이 파일
 *
 * ③은 스키닝 전 정점을 건드리므로 애니메이션과 충돌하지 않는다.
 *
 * 처음 판에서 스킨 가중치를 그대로 배율에 곱했더니 배가 울퉁불퉁하고 한쪽만 불룩한
 * "임신한 고양이"가 됐다. 원인 셋을 전부 고쳤다.
 *   · 가중치가 정점마다 튄다        → 위치가 같은 정점을 묶고 인접 그래프로 라플라시안 스무딩
 *   · X축으로만 늘려 단면이 납작해짐 → 등뼈 축에서의 방사 방향으로 밀어 단면을 둥글게 유지
 *   · 배 중간만 부푼다              → 몸통 길이(Z) 방향으로 부드러운 종 모양 프로파일을 곱해
 *                                    목·엉덩이 쪽으로 자연스럽게 사라지게
 */

// 이 리그의 몸통 뼈 이름(36개 중). Spine_base / spine_02 / spine_03 이 실제 이름이다.
const TORSO_BONE_PATTERN = /spine|chest|pelvis/i;
// 다리 계열 — hip_bR / leg_bL / foot_fR / claw_bL / Helper_foot_fL 같은 이름을 쓴다.
const LEG_BONE_PATTERN = /hip|leg|foot|claw|knee|ankle/i;
// 같은 위치의 정점을 하나로 묶는 격자 크기. 비인덱스 지오메트리라 한 점이 여러 번 들어 있다.
const WELD_PRECISION = 1e5;
// 가중치 스무딩 횟수. 3회면 로우폴리 노이즈가 사라지고 실루엣이 매끄러워진다.
const SMOOTH_PASSES = 3;
// 등은 덜, 배는 더 부푼다. 0.55면 등도 살짝 두꺼워지면서 배가 확실히 앞선다.
const BACK_SHARE = 0.55;
// 몸통 길이 방향 프로파일의 끝 감쇠. 목·엉덩이에서 0으로 수렴시킨다.
const PROFILE_EXPONENT = 0.55;
// 처짐은 갈비뼈와 뒷다리 사이(몸통의 60% 지점)가 가장 깊다 — 실제 고양이 뱃살이 그렇다.
const SAG_CENTER = 0.62;
const SAG_SPREAD = 0.26;
const SAG_STRENGTH = 1.45;
// 다리 단축 경계를 부드럽게 잇는 구간(몸 높이 대비).
const LEG_BLEND_RATIO = 0.18;

// 원본 몸통이 3,000삼각형뿐이라 그냥 부풀리면 큰 면이 각져서 뾰족하게 튄다.
// 변형 전에 한 번 쪼개고(1→4), 변형 후 Taubin 스무딩으로 각을 눌러 준다.
const SUBDIVIDE_TRIANGLE_BUDGET = 24000;
const TAUBIN_LAMBDA = 0.5;
const TAUBIN_MU = -0.53;
const TAUBIN_PASSES = 2;

export type CatShape = {
  /** 몸통 둘레 배율. 1 = 원본, 1.45 = 배 둘레 45% 확대. 1.8을 넘기면 부자연스럽다. */
  belly?: number;
  /** 살이 아래로 쏠리는 정도. 0 = 고르게 둥글게, 1 = 아랫배가 처진다. */
  sag?: number;
  /** 다리 길이 배율. 1 = 원본, 0.75 = 25% 짧은 숏다리. */
  legs?: number;
  /** 면을 쪼개고 각을 눌러 매끈하게. 끄면 원본 로우폴리 각이 그대로 남는다. */
  smooth?: boolean;
};

export type FattenResult = {
  meshes: number;
  vertices: number;
  torsoBones: string[];
  legBones: string[];
};

const DEFAULT_SHAPE: Required<CatShape> = {
  belly: 1.35,
  sag: 0.35,
  legs: 1,
  smooth: true,
};

function resolveShape(input: number | CatShape): Required<CatShape> {
  if (typeof input === "number") return { ...DEFAULT_SHAPE, belly: input };
  return { ...DEFAULT_SHAPE, ...input };
}

function smoothStep(edge0: number, edge1: number, value: number) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0 || 1)));
  return t * t * (3 - 2 * t);
}

/**
 * 비인덱스 삼각형을 1→4로 쪼갠다. 스킨 가중치까지 같이 보간해야 애니메이션이 그대로 산다.
 * 두 부모의 뼈-가중치를 합산해 상위 4개만 남기고 정규화한다.
 */
function subdivideSkinnedGeometry(geometry: THREE.BufferGeometry) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const attributes = ["position", "normal", "uv", "skinIndex", "skinWeight"];
  const src: Record<string, THREE.BufferAttribute> = {};
  for (const name of attributes) {
    const attribute = source.getAttribute(name);
    if (attribute) src[name] = attribute as THREE.BufferAttribute;
  }
  if (!src.position || !src.skinIndex || !src.skinWeight) return null;

  const triangles = src.position.count / 3;
  const out: Record<string, number[]> = {};
  for (const name of Object.keys(src)) out[name] = [];

  const pushVertex = (name: string, values: number[]) => {
    for (const value of values) out[name].push(value);
  };
  const read = (name: string, index: number) => {
    const attribute = src[name];
    const values: number[] = [];
    for (let item = 0; item < attribute.itemSize; item += 1) {
      values.push(attribute.getComponent(index, item));
    }
    return values;
  };
  const midpoint = (name: string, a: number, b: number) => {
    const left = read(name, a);
    const right = read(name, b);
    return left.map((value, index) => (value + right[index]) / 2);
  };
  // 뼈 가중치는 산술평균이 아니라 뼈별로 합쳐서 상위 4개를 남긴다.
  const mixSkin = (a: number, b: number) => {
    const merged = new Map<number, number>();
    for (const vertex of [a, b]) {
      for (let slot = 0; slot < 4; slot += 1) {
        const bone = src.skinIndex.getComponent(vertex, slot);
        const weight = src.skinWeight.getComponent(vertex, slot);
        if (weight <= 0) continue;
        merged.set(bone, (merged.get(bone) ?? 0) + weight / 2);
      }
    }
    const top = [...merged.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 4);
    const total = top.reduce((sum, [, weight]) => sum + weight, 0) || 1;
    const indices = [0, 0, 0, 0];
    const weights = [0, 0, 0, 0];
    top.forEach(([bone, weight], slot) => {
      indices[slot] = bone;
      weights[slot] = weight / total;
    });
    return { indices, weights };
  };

  const emit = (
    corners: Array<
      | { kind: "vertex"; index: number }
      | { kind: "mid"; a: number; b: number }
    >,
  ) => {
    for (const corner of corners) {
      if (corner.kind === "vertex") {
        for (const name of Object.keys(src)) {
          pushVertex(name, read(name, corner.index));
        }
      } else {
        for (const name of Object.keys(src)) {
          if (name === "skinIndex" || name === "skinWeight") continue;
          pushVertex(name, midpoint(name, corner.a, corner.b));
        }
        const skin = mixSkin(corner.a, corner.b);
        pushVertex("skinIndex", skin.indices);
        pushVertex("skinWeight", skin.weights);
      }
    }
  };

  for (let triangle = 0; triangle < triangles; triangle += 1) {
    const a = triangle * 3;
    const b = a + 1;
    const c = a + 2;
    const ab = { kind: "mid" as const, a, b };
    const bc = { kind: "mid" as const, a: b, b: c };
    const ca = { kind: "mid" as const, a: c, b: a };
    emit([{ kind: "vertex", index: a }, ab, ca]);
    emit([ab, { kind: "vertex", index: b }, bc]);
    emit([ca, bc, { kind: "vertex", index: c }]);
    emit([ab, bc, ca]);
  }

  const result = new THREE.BufferGeometry();
  for (const name of Object.keys(src)) {
    const itemSize = src[name].itemSize;
    const array =
      name === "skinIndex"
        ? new Uint16Array(out[name])
        : new Float32Array(out[name]);
    result.setAttribute(name, new THREE.BufferAttribute(array, itemSize));
  }
  result.computeVertexNormals();
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

/** 위치가 같은 정점들을 한 덩어리로 묶는다. 같은 값을 줘야 면이 갈라지지 않는다. */
function weldVertices(position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) {
  const groupOfVertex = new Int32Array(position.count);
  const lookup = new Map<string, number>();
  const groupVertices: number[][] = [];
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const key = `${Math.round(position.getX(vertex) * WELD_PRECISION)}|${Math.round(
      position.getY(vertex) * WELD_PRECISION,
    )}|${Math.round(position.getZ(vertex) * WELD_PRECISION)}`;
    let group = lookup.get(key);
    if (group === undefined) {
      group = groupVertices.length;
      lookup.set(key, group);
      groupVertices.push([]);
    }
    groupVertices[group].push(vertex);
    groupOfVertex[vertex] = group;
  }
  return { groupOfVertex, groupVertices };
}

/** 삼각형을 따라 그룹끼리의 이웃 관계를 만든다. */
function buildAdjacency(
  groupOfVertex: Int32Array,
  vertexCount: number,
  groupCount: number,
) {
  const neighbours: Set<number>[] = Array.from(
    { length: groupCount },
    () => new Set<number>(),
  );
  for (let triangle = 0; triangle + 2 < vertexCount; triangle += 3) {
    const a = groupOfVertex[triangle];
    const b = groupOfVertex[triangle + 1];
    const c = groupOfVertex[triangle + 2];
    neighbours[a].add(b).add(c);
    neighbours[b].add(a).add(c);
    neighbours[c].add(a).add(b);
  }
  return neighbours;
}

/** 라플라시안 스무딩 — 가중치 필드의 노이즈를 편다. */
function smoothField(
  field: Float32Array,
  neighbours: Set<number>[],
  passes: number,
) {
  let current = field;
  for (let pass = 0; pass < passes; pass += 1) {
    const next = new Float32Array(current.length);
    for (let group = 0; group < current.length; group += 1) {
      let sum = 0;
      for (const neighbour of neighbours[group]) sum += current[neighbour];
      const count = neighbours[group].size;
      next[group] = count ? current[group] * 0.4 + (sum / count) * 0.6 : current[group];
    }
    current = next;
  }
  return current;
}

/**
 * @param input 배율 하나만 주면 둘레만 키우고, 객체를 주면 처짐·다리 길이까지 조절한다.
 */
export function fattenCat(
  root: THREE.Object3D,
  input: number | CatShape = DEFAULT_SHAPE,
): FattenResult {
  const shape = resolveShape(input);
  const result: FattenResult = {
    meshes: 0,
    vertices: 0,
    torsoBones: [],
    legBones: [],
  };
  if (shape.belly === 1 && shape.legs === 1) return result;

  root.traverse((object) => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    // 부풀리기 전에 면을 한 번 쪼갠다 — 3,000삼각형짜리를 그냥 늘리면 각이 뾰족하게 튄다.
    if (shape.smooth) {
      const triangles = object.geometry.getAttribute("position").count / 3;
      if (triangles * 4 <= SUBDIVIDE_TRIANGLE_BUDGET) {
        const finer = subdivideSkinnedGeometry(object.geometry);
        if (finer) {
          object.geometry.dispose();
          object.geometry = finer;
        }
      }
    }
    const geometry = object.geometry;
    const position = geometry.getAttribute("position");
    const skinIndex = geometry.getAttribute("skinIndex");
    const skinWeight = geometry.getAttribute("skinWeight");
    if (!position || !skinIndex || !skinWeight) return;

    const torso = new Set<number>();
    const legs = new Set<number>();
    object.skeleton.bones.forEach((bone, index) => {
      if (TORSO_BONE_PATTERN.test(bone.name)) {
        torso.add(index);
        if (!result.torsoBones.includes(bone.name)) result.torsoBones.push(bone.name);
      } else if (LEG_BONE_PATTERN.test(bone.name)) {
        legs.add(index);
        if (!result.legBones.includes(bone.name)) result.legBones.push(bone.name);
      }
    });
    if (torso.size === 0) return;

    const { groupOfVertex, groupVertices } = weldVertices(position);
    const groupCount = groupVertices.length;

    // 그룹 단위 몸통/다리 가중치 — 묶은 뒤 평균내고, 그 다음 스무딩한다.
    const rawTorso = new Float32Array(groupCount);
    const rawLeg = new Float32Array(groupCount);
    for (let group = 0; group < groupCount; group += 1) {
      let torsoSum = 0;
      let legSum = 0;
      for (const vertex of groupVertices[group]) {
        for (let slot = 0; slot < 4; slot += 1) {
          const bone = skinIndex.getComponent(vertex, slot);
          const weight = skinWeight.getComponent(vertex, slot);
          if (torso.has(bone)) torsoSum += weight;
          else if (legs.has(bone)) legSum += weight;
        }
      }
      const size = groupVertices[group].length || 1;
      rawTorso[group] = Math.min(1, torsoSum / size);
      rawLeg[group] = Math.min(1, legSum / size);
    }
    const neighbours = buildAdjacency(groupOfVertex, position.count, groupCount);
    const torsoMask = smoothField(rawTorso, neighbours, SMOOTH_PASSES);

    // 몸통이 차지하는 길이(Z) 구간과, 그 안에서의 등뼈 높이 곡선을 구한다.
    let torsoFront = Number.POSITIVE_INFINITY;
    let torsoBack = Number.NEGATIVE_INFINITY;
    const groupPosition = new Float32Array(groupCount * 3);
    for (let group = 0; group < groupCount; group += 1) {
      const vertex = groupVertices[group][0];
      const z = position.getZ(vertex);
      groupPosition[group * 3] = position.getX(vertex);
      groupPosition[group * 3 + 1] = position.getY(vertex);
      groupPosition[group * 3 + 2] = z;
      if (torsoMask[group] > 0.25) {
        torsoFront = Math.min(torsoFront, z);
        torsoBack = Math.max(torsoBack, z);
      }
    }
    if (!Number.isFinite(torsoFront) || torsoBack <= torsoFront) return;

    const SLICES = 20;
    const sliceSum = new Float64Array(SLICES);
    const sliceWeight = new Float64Array(SLICES);
    const sliceRadius = new Float64Array(SLICES);
    for (let group = 0; group < groupCount; group += 1) {
      const mask = torsoMask[group];
      if (mask <= 0.05) continue;
      const z = groupPosition[group * 3 + 2];
      const slice = Math.min(
        SLICES - 1,
        Math.max(
          0,
          Math.floor(((z - torsoFront) / (torsoBack - torsoFront)) * SLICES),
        ),
      );
      sliceSum[slice] += groupPosition[group * 3 + 1] * mask;
      sliceWeight[slice] += mask;
    }
    // 빈 슬라이스는 이웃에서 메우고, 한 번 더 평활화해 축이 튀지 않게 한다.
    const axisY = new Float64Array(SLICES);
    let lastKnown = 0;
    for (let slice = 0; slice < SLICES; slice += 1) {
      axisY[slice] = sliceWeight[slice]
        ? sliceSum[slice] / sliceWeight[slice]
        : lastKnown;
      lastKnown = axisY[slice];
    }
    for (let slice = SLICES - 1; slice >= 0; slice -= 1) {
      if (!sliceWeight[slice]) axisY[slice] = axisY[Math.min(SLICES - 1, slice + 1)];
    }
    const smoothedAxis = new Float64Array(SLICES);
    for (let slice = 0; slice < SLICES; slice += 1) {
      const previous = axisY[Math.max(0, slice - 1)];
      const next = axisY[Math.min(SLICES - 1, slice + 1)];
      smoothedAxis[slice] = (previous + axisY[slice] * 2 + next) / 4;
    }

    // 슬라이스별 반지름 — 처짐 양을 몸 굵기에 맞춰 정하려고 쓴다.
    for (let group = 0; group < groupCount; group += 1) {
      const mask = torsoMask[group];
      if (mask <= 0.25) continue;
      const z = groupPosition[group * 3 + 2];
      const slice = Math.min(
        SLICES - 1,
        Math.max(
          0,
          Math.floor(((z - torsoFront) / (torsoBack - torsoFront)) * SLICES),
        ),
      );
      const dx = groupPosition[group * 3];
      const dy = groupPosition[group * 3 + 1] - smoothedAxis[slice];
      sliceRadius[slice] = Math.max(sliceRadius[slice], Math.hypot(dx, dy));
    }
    let bodyRadius = 0;
    for (let slice = 0; slice < SLICES; slice += 1) {
      bodyRadius = Math.max(bodyRadius, sliceRadius[slice]);
    }
    if (bodyRadius <= 0) return;

    const gain = shape.belly - 1;
    const displacement = new Float32Array(groupCount * 3);
    for (let group = 0; group < groupCount; group += 1) {
      const mask = torsoMask[group];
      if (mask <= 0.01) continue;
      const x = groupPosition[group * 3];
      const y = groupPosition[group * 3 + 1];
      const z = groupPosition[group * 3 + 2];
      const t = Math.min(
        1,
        Math.max(0, (z - torsoFront) / (torsoBack - torsoFront)),
      );
      const sliceIndex = Math.min(SLICES - 1, Math.floor(t * SLICES));
      // 목·엉덩이에서 0으로 수렴하는 종 모양. 가운데가 가장 두껍다.
      const profile = Math.pow(Math.sin(Math.PI * t), PROFILE_EXPONENT);
      const axis = smoothedAxis[sliceIndex];
      const dx = x;
      const dy = y - axis;
      const radius = Math.hypot(dx, dy);
      if (radius <= 1e-6) continue;
      // 아래쪽일수록 1에 가까워지는 부드러운 값. 등은 BACK_SHARE 만큼만 부푼다.
      const lowness = smoothStep(0.35, -0.9, dy / Math.max(radius, 1e-6));
      const share = BACK_SHARE + (1 - BACK_SHARE) * lowness;
      const grow = gain * mask * profile * share;
      displacement[group * 3] = dx * grow;
      displacement[group * 3 + 1] = dy * grow;
      // 처짐 — 뱃살이 몰리는 구간만 종 모양으로 끌어내린다. 등·목·엉덩이는 건드리지 않는다.
      const sagProfile = Math.exp(
        -((t - SAG_CENTER) ** 2) / (2 * SAG_SPREAD ** 2),
      );
      displacement[group * 3 + 1] -=
        shape.sag *
        gain *
        mask *
        sagProfile *
        lowness *
        bodyRadius *
        SAG_STRENGTH;
    }

    for (let vertex = 0; vertex < position.count; vertex += 1) {
      const group = groupOfVertex[vertex];
      position.setXYZ(
        vertex,
        position.getX(vertex) + displacement[group * 3],
        position.getY(vertex) + displacement[group * 3 + 1],
        position.getZ(vertex) + displacement[group * 3 + 2],
      );
    }

    // 다리 줄이기 — 엉덩이 높이 아래를 세로로 눌러 붙이고, 그 위는 통째로 같이 내린다.
    // 경계를 딱 자르면 접히는 자국이 생기므로 한 구간에 걸쳐 부드럽게 섞는다.
    if (shape.legs !== 1) {
      let floorY = Number.POSITIVE_INFINITY;
      let topY = Number.NEGATIVE_INFINITY;
      let hipY = Number.NEGATIVE_INFINITY;
      for (let vertex = 0; vertex < position.count; vertex += 1) {
        const y = position.getY(vertex);
        floorY = Math.min(floorY, y);
        topY = Math.max(topY, y);
        if (rawLeg[groupOfVertex[vertex]] > 0.5) hipY = Math.max(hipY, y);
      }
      if (Number.isFinite(floorY) && hipY > floorY) {
        const blend = (topY - floorY) * LEG_BLEND_RATIO;
        const drop = (hipY - floorY) * (1 - shape.legs);
        for (let vertex = 0; vertex < position.count; vertex += 1) {
          const y = position.getY(vertex);
          const compressed = floorY + (y - floorY) * shape.legs;
          const shifted = y - drop;
          const mix = smoothStep(hipY - blend, hipY + blend, y);
          position.setY(vertex, compressed * (1 - mix) + shifted * mix);
        }
      }
    }

    // 마지막으로 각을 눌러 준다. Taubin(λ 수축 → μ 팽창)이라 볼륨이 안 쪼그라든다.
    // 몸통 마스크만큼만 먹이므로 머리·다리·꼬리 실루엣은 그대로다.
    if (shape.smooth) {
      const current = new Float32Array(groupCount * 3);
      for (let group = 0; group < groupCount; group += 1) {
        const vertex = groupVertices[group][0];
        current[group * 3] = position.getX(vertex);
        current[group * 3 + 1] = position.getY(vertex);
        current[group * 3 + 2] = position.getZ(vertex);
      }
      const relax = (factor: number) => {
        const next = new Float32Array(current.length);
        for (let group = 0; group < groupCount; group += 1) {
          const strength = factor * Math.min(1, torsoMask[group] * 1.2);
          let sumX = 0;
          let sumY = 0;
          let sumZ = 0;
          const count = neighbours[group].size;
          for (const neighbour of neighbours[group]) {
            sumX += current[neighbour * 3];
            sumY += current[neighbour * 3 + 1];
            sumZ += current[neighbour * 3 + 2];
          }
          for (let axis = 0; axis < 3; axis += 1) {
            const value = current[group * 3 + axis];
            const average =
              count === 0
                ? value
                : [sumX, sumY, sumZ][axis] / count;
            next[group * 3 + axis] = value + (average - value) * strength;
          }
        }
        current.set(next);
      };
      for (let pass = 0; pass < TAUBIN_PASSES; pass += 1) {
        relax(TAUBIN_LAMBDA);
        relax(TAUBIN_MU);
      }
      for (let group = 0; group < groupCount; group += 1) {
        for (const vertex of groupVertices[group]) {
          position.setXYZ(
            vertex,
            current[group * 3],
            current[group * 3 + 1],
            current[group * 3 + 2],
          );
        }
      }
    }

    position.needsUpdate = true;
    // 비인덱스 지오메트리라 면 단위 노멀이 다시 계산되어 로우폴리 각이 그대로 남는다.
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    result.meshes += 1;
    result.vertices += position.count;
  });

  return result;
}
