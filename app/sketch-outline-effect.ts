import * as THREE from "three";

type OutlineEffectOptions = {
  defaultThickness: number;
  defaultColor: number[];
  defaultAlpha: number;
};

type OutlineParameters = {
  thickness?: number;
  color?: number[];
  alpha?: number;
  visible?: boolean;
};

const outlineVertexShader = `
  #include <common>
  #include <uv_pars_vertex>
  #include <displacementmap_pars_vertex>
  #include <fog_pars_vertex>
  #include <morphtarget_pars_vertex>
  #include <skinning_pars_vertex>
  #include <logdepthbuf_pars_vertex>
  #include <clipping_planes_pars_vertex>

  uniform float outlineThickness;

  vec4 calculateOutline(vec4 pos, vec3 normal, vec4 skinned) {
    vec4 pos2 = projectionMatrix * modelViewMatrix * vec4(skinned.xyz + normal, 1.0);
    vec4 norm = normalize(pos - pos2);
    return pos + norm * outlineThickness * pos.w;
  }

  void main() {
    #include <uv_vertex>
    #include <beginnormal_vertex>
    #include <morphnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <begin_vertex>
    #include <morphtarget_vertex>
    #include <skinning_vertex>
    #include <displacementmap_vertex>
    #include <project_vertex>

    vec3 outlineNormal = -objectNormal;
    gl_Position = calculateOutline(gl_Position, outlineNormal, vec4(transformed, 1.0));

    #include <logdepthbuf_vertex>
    #include <clipping_planes_vertex>
    #include <fog_vertex>
  }
`;

const outlineFragmentShader = `
  #include <common>
  #include <fog_pars_fragment>
  #include <logdepthbuf_pars_fragment>
  #include <clipping_planes_pars_fragment>

  uniform vec3 outlineColor;
  uniform float outlineAlpha;

  void main() {
    #include <clipping_planes_fragment>
    #include <logdepthbuf_fragment>

    float slowWave = sin(gl_FragCoord.x * 0.115 + gl_FragCoord.y * 0.071);
    float crossWave = sin(gl_FragCoord.x * -0.047 + gl_FragCoord.y * 0.137);
    float fineWave = sin((gl_FragCoord.x + gl_FragCoord.y) * 0.213);
    float paperGap = slowWave * 0.52 + crossWave * 0.33 + fineWave * 0.15;
    if (paperGap > 0.79) discard;

    gl_FragColor = vec4(outlineColor, outlineAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
    #include <premultiplied_alpha_fragment>
  }
`;

function firstMaterial(object: THREE.Mesh) {
  return Array.isArray(object.material)
    ? object.material[0]
    : object.material;
}

export class SketchOutlineEffect {
  enabled = true;
  autoClear = true;

  private readonly outlineMaterial: THREE.ShaderMaterial;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    options: OutlineEffectOptions,
  ) {
    this.outlineMaterial = new THREE.ShaderMaterial({
      name: "cats-soup-sketch-outline",
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        THREE.UniformsLib.displacementmap,
        {
          outlineThickness: { value: options.defaultThickness },
          outlineColor: {
            value: new THREE.Color().fromArray(options.defaultColor),
          },
          outlineAlpha: { value: options.defaultAlpha },
        },
      ]),
      vertexShader: outlineVertexShader,
      fragmentShader: outlineFragmentShader,
      side: THREE.BackSide,
      transparent: options.defaultAlpha < 1,
      fog: true,
      toneMapped: true,
    });
  }

  render(scene: THREE.Scene, camera: THREE.Camera) {
    if (!this.enabled) {
      this.renderer.render(scene, camera);
      return;
    }

    const previousAutoClear = this.renderer.autoClear;
    this.renderer.autoClear = this.autoClear;
    this.renderer.render(scene, camera);
    this.renderer.autoClear = previousAutoClear;
    this.renderOutline(scene, camera);
  }

  private renderOutline(scene: THREE.Scene, camera: THREE.Camera) {
    const visibility = new Map<THREE.Object3D, boolean>();
    const beforeRender = new Map<
      THREE.Object3D,
      THREE.Object3D["onBeforeRender"]
    >();
    const previousBackground = scene.background;
    const previousOverrideMaterial = scene.overrideMaterial;
    const previousAutoClear = this.renderer.autoClear;
    const previousShadowMapEnabled = this.renderer.shadowMap.enabled;

    scene.traverse((object) => {
      visibility.set(object, object.visible);
      if (!(object instanceof THREE.Mesh)) {
        if (object instanceof THREE.Sprite || object instanceof THREE.Line) {
          object.visible = false;
        }
        return;
      }

      const material = firstMaterial(object);
      const parameters = material.userData
        .outlineParameters as OutlineParameters | undefined;
      const hasNormals = Boolean(object.geometry.getAttribute("normal"));
      const visible =
        object.visible &&
        material.visible &&
        material.depthTest !== false &&
        (material as THREE.MeshBasicMaterial).wireframe !== true &&
        hasNormals &&
        parameters?.visible !== false;
      object.visible = visible;
      if (!visible) return;

      beforeRender.set(object, object.onBeforeRender);
      object.onBeforeRender = () => {
        const thickness =
          parameters?.thickness ??
          this.outlineMaterial.uniforms.outlineThickness.value;
        const alpha = parameters?.alpha ?? material.opacity;
        this.outlineMaterial.uniforms.outlineThickness.value = thickness;
        this.outlineMaterial.uniforms.outlineAlpha.value = alpha;
        if (parameters?.color) {
          this.outlineMaterial.uniforms.outlineColor.value.fromArray(
            parameters.color,
          );
        }
      };
    });

    scene.background = null;
    scene.overrideMaterial = this.outlineMaterial;
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = false;
    this.renderer.render(scene, camera);

    scene.overrideMaterial = previousOverrideMaterial;
    scene.background = previousBackground;
    this.renderer.autoClear = previousAutoClear;
    this.renderer.shadowMap.enabled = previousShadowMapEnabled;
    scene.traverse((object) => {
      const wasVisible = visibility.get(object);
      if (wasVisible !== undefined) object.visible = wasVisible;
      const callback = beforeRender.get(object);
      if (callback) object.onBeforeRender = callback;
    });
  }

  dispose() {
    this.outlineMaterial.dispose();
  }
}
