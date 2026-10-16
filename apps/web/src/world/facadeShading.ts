import type * as THREE from "three";

/** Restrained contact-tone shading on vertical facade faces, within the existing
 * opaque Lambert pass. No haze, emissive fill, outlines or shadow-map pass. */
export function shadeFacade(material: THREE.MeshLambertMaterial) {
  material.customProgramCacheKey = () => "ae-facade-contact-v1";
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
      varying float vFacadeHeight;
      varying float vFacadeSide;`).replace("#include <begin_vertex>", `#include <begin_vertex>
      vFacadeHeight = position.y;
      vFacadeSide = 1.0 - step(0.5, abs(normal.y));`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
      varying float vFacadeHeight;
      varying float vFacadeSide;`).replace("#include <color_fragment>", `#include <color_fragment>
      float eaveShade = smoothstep(0.36, 0.5, vFacadeHeight) * 0.08;
      float baseShade = (1.0 - smoothstep(-0.5, -0.42, vFacadeHeight)) * 0.025;
      diffuseColor.rgb *= 1.0 - vFacadeSide * (eaveShade + baseShade);`);
  };
}
