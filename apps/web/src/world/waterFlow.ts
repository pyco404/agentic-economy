import * as THREE from "three";
import { cityPalette } from "./palette";

// One world viewport: shared uniforms keep streamed canal tiles and the frontier
// continuous, without retaining references to disposed materials/chunks.
export const waterFlowUniforms = {
  waterTime: { value: 0 },
  waterRight: { value: new THREE.Vector2(1, -1).normalize() },
  // Allows the capture harness to isolate this visual layer without changing
  // geometry, economic state, or production UI controls.
  waterStrength: { value: 1 },
};

/** Project the camera's right axis onto the level water plane. */
export function waterDirection(camera: THREE.Camera): THREE.Vector2 {
  const axis = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  return new THREE.Vector2(axis.x, axis.z).normalize();
}

export function updateWaterFlow(seconds: number, camera: THREE.Camera) {
  waterFlowUniforms.waterTime.value = seconds;
  waterFlowUniforms.waterRight.value.copy(waterDirection(camera));
}

export function createWaterMaterial(vertexColors = false) {
  const material = new THREE.MeshLambertMaterial({
    color: vertexColors ? "#ffffff" : cityPalette.water,
    vertexColors,
  });
  material.userData.waterFlow = true;
  material.customProgramCacheKey = () => "ae-calm-water-flow-v1";
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, waterFlowUniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
        varying vec3 vWaterWorld;
        varying float vWaterTop;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vec4 waterVertex = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          waterVertex = instanceMatrix * waterVertex;
        #endif
        vWaterWorld = (modelMatrix * waterVertex).xyz;
        vWaterTop = step(0.8, normal.y);`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        uniform float waterTime;
        uniform float waterStrength;
        uniform vec2 waterRight;
        varying vec3 vWaterWorld;
        varying float vWaterTop;`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        // All phase motion travels along the screen-right ground-plane axis.
        // Low frequencies remain legible at the normal orthographic zoom.
        float along = dot(vWaterWorld.xz, waterRight) - waterTime * 0.85;
        float across = dot(vWaterWorld.xz, vec2(-waterRight.y, waterRight.x));
        float ripple = sin(along * 1.85 + sin(across * 0.7) * 0.32);
        float bands = smoothstep(0.72, 0.98, ripple);
        float lanes = pow(0.5 + 0.5 * sin(across * 5.2 + sin(across * 1.3)), 6.0);
        float streak = smoothstep(0.05, 0.88, sin(along * 0.82 + across * 0.18));
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.90, 0.97, 0.97), waterStrength);
        diffuseColor.rgb *= 1.0 + waterStrength * vWaterTop * (ripple * 0.035 - 0.035);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.74, 0.89, 0.93),
          waterStrength * vWaterTop * (bands * 0.14 + lanes * streak * 0.17));`);
  };
  return material;
}
