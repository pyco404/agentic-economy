/** Offline film renderer. Imports the real city generators without changing the app. */
import * as THREE from '/apps/web/node_modules/three/build/three.module.js';
import { worldChunkToVisual, numericSeed } from '/apps/web/src/api/adapter.ts';
import { geometryLibrary, createBatch } from '/apps/web/src/world/geometry.ts';
import { prepareScenery } from '/apps/web/src/world/sceneryPlan.ts';
import { createFrontierScene } from '/apps/web/src/world/frontierScene.ts';
import { createAmbientScene } from '/apps/web/src/world/ambient.ts';
import { updateWaterFlow } from '/apps/web/src/world/waterFlow.ts';
import { createCitizens } from '/apps/web/src/world/citizens.ts';
import { createDemoWalkers } from '/apps/web/src/world/agentMotion.ts';
import { cityPalette } from '/apps/web/src/world/palette.ts';
const [boot, raw, agents] = await Promise.all(['bootstrap','chunks','agents'].map(n=>fetch(`/video/agentic-economy-explainer/cache/${n}.json`).then(r=>r.json())));
const chunks = raw.chunks.map(worldChunkToVisual), seed = numericSeed(boot.seed);
const scene = new THREE.Scene(); scene.background = new THREE.Color(cityPalette.parchment);
const renderer = new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
renderer.setSize(720,720); renderer.setPixelRatio(1); renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.NoToneMapping; document.body.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight('#ffffff','#e0d3b8',.9));
const sun=new THREE.DirectionalLight('#fff6e7',1.71);sun.position.set(-60,100,30);scene.add(sun);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(2000,2000),new THREE.MeshLambertMaterial({color:cityPalette.parchment}));ground.rotation.x=-Math.PI/2;ground.position.y=-.5;scene.add(ground);
const library=geometryLibrary(), architecture=[];
let streets, frontier, ambient, walkers;
prepareScenery({revision:1,chunks,seed,center:{x:64,z:64},known:{},style:'frontier',catalog:boot.chunks},message=>{
 if(message.kind==='roads'){streets=message.streets;walkers=createDemoWalkers(message.pathNetwork,chunks.flatMap(c=>c.buildings));}
 if(message.kind==='chunk'){
  scene.add(createBatch([...message.chunk.landscape,...(streets.parts.get(message.chunk.data.id)??[])],library));
  const buildings=createBatch(message.chunk.architecture,library);architecture.push({group:buildings,rank:message.chunk.rank});scene.add(buildings);
 }
 if(message.kind==='scenery'){
  ambient=createAmbientScene(message.ambient,library);scene.add(ambient.group);
  frontier=createFrontierScene({...message.frontier,parts:[...message.frontier.parts.filter((_,i)=>!ambient.clearedFrontierParts.has(i)),...message.composition.parts]},library,ambient.cuts);scene.add(frontier.group);
 }
});
const citizens=createCitizens(64);citizens.meshes.forEach(m=>scene.add(m));
const camera=new THREE.OrthographicCamera(-100,100,100,-100,.1,4000), center=new THREE.Vector3(64,0,64);
let previous=0;
window.renderCity=(seconds)=>{
 // Continuous opening shot; camera is a film-only camera, never the app controller.
 const u=Math.min(1,seconds/15), angle=.67+u*.16;
 camera.zoom=1.17+u*.12;camera.updateProjectionMatrix();
 center.set(64-u*5,0,64-u*2);camera.position.copy(center).add(new THREE.Vector3(Math.sin(angle)*190,142,Math.cos(angle)*190));camera.lookAt(center);camera.updateMatrixWorld();
 ambient.update(seconds+8,true,seconds+8);frontier.update(seconds,true);updateWaterFlow(seconds,camera);
 agents.agents.slice(0,32).forEach((a,i)=>{const p=walkers.position(a.id,a.pos.x,a.pos.y,seconds,Math.max(0,seconds-previous),false);citizens.set(i,p.x,p.y,seconds*.1,seconds*5+i,true,['#628b73','#ba7961','#7597ac'][i%3],i%3===0);});
 citizens.finish(Math.min(32,agents.agents.length));previous=seconds;
 scene.traverse(o=>{if(o.userData.detail)o.visible=camera.zoom>1.8;});
 renderer.render(scene,camera);return {calls:renderer.info.render.calls,buildings:chunks.reduce((n,c)=>n+c.buildings.length,0)};
};
window.renderCity(0);window.cityReady=true;
