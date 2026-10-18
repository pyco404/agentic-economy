import { findRoute, distance, type NavigationGraph, type NavPoint } from "./navigation";
import { random } from "./layout";
export interface JourneyActor {
  id: string; node: string; target: string | null; position: NavPoint; heading: number; speed: number;
  route: NavPoint[]; cursor: number; segment: number; remaining: number; waitUntil: number;
  state: "docked" | "parked" | "departing" | "traveling" | "arriving" | "yielding";
  completed: number; traveled: number; recent: string[]; destinations: string[]; rng: () => number;
  history: { from: string; to: string; length: number; at: number }[];
}
interface Options { seed: number; minTrip: number; dwellMin: number; dwellVariation: number; acceleration: number;
  speed: (index: number) => number; separation: number; boats?: boolean; turnRate?: number;
  fits?: (point: NavPoint, heading: number) => boolean;
  overlaps?: (a: NavPoint, ah: number, b: NavPoint, bh: number) => boolean; }
const angle = (a: number) => Math.atan2(Math.sin(a),Math.cos(a));
/** Persistent destination journeys, shared by decorative transport only. Every
 * translation follows A* edges. No loop wrapping, spawn reset or economic event. */
export function createJourneyFleet(graph: NavigationGraph, starts: string[], destinations: string[], options: Options) {
  const actors: JourneyActor[] = starts.map((node,i)=>({id:`${graph.kind}-${i}`,node,target:null,
    position:{...graph.nodes.get(node)!},heading:graph.kind==="vehicle"?Number(node.split(":").at(-1))*Math.PI/2:0,speed:0,
    route:[],cursor:1,segment:0,remaining:0,waitUntil:i*3.7+1.5,state:options.boats?"docked":"parked",completed:0,traveled:0,recent:[node],destinations:[],
    rng:random(options.seed+i*971),history:[]}));
  let previous = 0, time = 0, plans = 0;
  const valid = (_actor: JourneyActor, point: NavPoint, heading: number) => !options.fits || options.fits(point,heading);
  const collision = (actor: JourneyActor, point: NavPoint, heading: number, pad=0) => actors.some(other=>other!==actor &&
    (options.overlaps ? options.overlaps(point,heading,other.position,other.heading) : distance(point,other.position)<options.separation+pad));
  function plan(actor: JourneyActor) {
    // Stagger route planning. At most one A* request batch per update, never per pixel/frame.
    if(plans>=1)return;plans++;
    const component=graph.component.get(actor.node), start=actor.position;
    // Reserve occupied route corridors at trip assignment. With six ambient
    // cars this cheap spatial index prevents head-on deadlocks in tight links,
    // without physics or changing road geometry. Junctions become available
    // again when the trip finishes.
    const reserved=new Set<string>();
    if(!options.boats) for(const other of actors)if(other!==actor){
      for(const p of [other.position,...other.route.slice(Math.max(0,other.cursor-1))])
        for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)reserved.add(`${Math.floor(p.x)+dx}:${Math.floor(p.z)+dz}`);
    }
    const candidates=destinations.filter(id=>id!==actor.node&&graph.component.get(id)===component&&!actor.recent.slice(-3).includes(id)&&
      !actors.some(other=>other!==actor&&(other.node===id||other.target===id)))
      .map(id=>({id,span:distance(start,graph.nodes.get(id)!),score:actor.rng()}));
    if(!candidates.length) actor.recent=actor.recent.slice(-1);
    const far=candidates.filter(c=>c.span>=options.minTrip), pool=far.length?far:candidates;
    const desiredSpan=options.minTrip+actor.rng()**2*100;
    pool.sort((a,b)=>options.boats?b.span*(.5+b.score)-a.span*(.5+a.score):Math.abs(a.span-desiredSpan)-a.score*12-Math.abs(b.span-desiredSpan)+b.score*12);
    for(const candidate of pool.slice(0,4)) {
      const blocked=(id:string)=>{const p=graph.nodes.get(id)!;return options.boats?actors.some(other=>other!==actor&&distance(p,other.position)<options.separation):reserved.has(`${Math.floor(p.x)}:${Math.floor(p.z)}`);};
      const route=findRoute(graph,actor.node,candidate.id,Math.max(30000,graph.nodes.size*2),blocked);
      if(!route||route.length<2)continue;
      const length=route.slice(1).reduce((n,p,i)=>n+distance(p,route[i]!),0);
      if(length<3)continue;
      actor.route=route;actor.cursor=1;actor.segment=0;actor.remaining=length;actor.target=candidate.id;
      actor.state="departing";actor.destinations.push(candidate.id);actor.destinations=actor.destinations.slice(-16);
      return;
    }
    actor.waitUntil=time+8+actor.rng()*4;
  }
  function step(dt:number) {
    time+=dt;
    for(let index=0;index<actors.length;index++) {
      const actor=actors[index]!;
      if(!actor.target) {
        if(time>=actor.waitUntil) {
          // Narrow-water service is serialized per component; boats waiting at
          // distinct piers remain visible. Other waterways operate independently.
          if(options.boats){
            const component=graph.component.get(actor.node);
            if(actors.some(a=>a!==actor&&a.target&&graph.component.get(a.node)===component))continue;
            // Oldest-ready departure wins, independently of array order. A long
            // connected river must not starve the ferry or service boat forever.
            if(actors.some(a=>a!==actor&&!a.target&&a.waitUntil<=time&&graph.component.get(a.node)===component&&
              (a.waitUntil<actor.waitUntil||a.waitUntil===actor.waitUntil&&a.id<actor.id)))continue;
          }
          plan(actor);
        }
        continue;
      }
      const from=actor.route[actor.cursor-1]!,to=actor.route[actor.cursor];
      if(!to)continue;
      const span=distance(from,to),dx=to.x-from.x,dz=to.z-from.z;
      let desired=Math.atan2(dx,dz);
      const after=actor.route[actor.cursor+1];
      const fraction=span?actor.segment/span:1;
      if(after&&fraction>.5) {const h=Math.atan2(after.x-to.x,after.z-to.z);desired+=angle(h-desired)*(fraction-.5);}
      if(options.boats) {
        const turnRate=options.turnRate??.85;
        const change=Math.max(-dt*turnRate,Math.min(dt*turnRate,angle(desired-actor.heading)));
        actor.heading+=change;
        if(actor.state==="departing"&&Math.abs(angle(desired-actor.heading))>.12) {actor.speed=0;continue;}
      }
      let nextHeading=options.boats?actor.heading:desired;
      const turn=after?Math.abs(angle(Math.atan2(after.x-to.x,after.z-to.z)-Math.atan2(dx,dz))):0;
      const cruise=options.speed(index)*(turn>.12?.4:1), braking=Math.sqrt(2*options.acceleration*Math.max(0,actor.remaining-.03));
      const wanted=Math.min(cruise,braking), speed=actor.speed+Math.max(-options.acceleration*dt,Math.min(options.acceleration*dt,wanted-actor.speed));
      let travel=Math.min(speed*dt,actor.remaining),cursor=actor.cursor,segment=actor.segment;
      let candidate={...actor.position};
      const actual=travel;
      while(travel>1e-8&&cursor<actor.route.length) {
        const a=actor.route[cursor-1]!,b=actor.route[cursor]!,length=distance(a,b),available=length-segment;
        const take=Math.min(travel,Math.max(0,available));segment+=take;travel-=take;
        const alpha=length?segment/length:1;candidate={x:a.x+(b.x-a.x)*alpha,y:a.y+(b.y-a.y)*alpha,z:a.z+(b.z-a.z)*alpha};
        if(!options.boats && a.heading!==undefined && b.heading!==undefined) nextHeading=a.heading+angle(b.heading-a.heading)*alpha;
        if(segment>=length-1e-8){cursor++;segment=0;}else break;
      }
      // Look-ahead starts yielding before hulls/bumpers meet. Rejected proposals
      // never consume path distance, so resuming cannot snap or skip geometry.
      const look={x:candidate.x+Math.sin(nextHeading)*.35,y:candidate.y,z:candidate.z+Math.cos(nextHeading)*.35};
      if(!valid(actor,candidate,nextHeading)||collision(actor,candidate,nextHeading)||collision(actor,look,nextHeading)) {
        actor.speed=0;actor.state="yielding";continue;
      }
      actor.position=candidate;actor.heading=nextHeading;actor.cursor=cursor;actor.segment=segment;actor.remaining=Math.max(0,actor.remaining-actual);
      actor.speed=speed;actor.traveled+=actual;actor.state=actor.remaining<2?"arriving":"traveling";
      if(actor.cursor>=actor.route.length||actor.remaining<.035) {
        // Finish the final centimetres along the existing route, never wrap to spawn.
        const destination=graph.nodes.get(actor.target)!;
        if(collision(actor,destination,nextHeading))continue;
        actor.position={...destination};actor.history.push({from:actor.node,to:actor.target,length:actor.route.slice(1).reduce((n,p,i)=>n+distance(p,actor.route[i]!),0),at:time});actor.history=actor.history.slice(-32);
        actor.node=actor.target;actor.recent.push(actor.node);actor.recent=actor.recent.slice(-5);actor.target=null;actor.completed++;
        actor.route=[];actor.speed=0;actor.waitUntil=time+options.dwellMin+actor.rng()*options.dwellVariation;actor.state=options.boats?"docked":"parked";
      }
    }
  }
  return {actors,update(seconds:number){const delta=Math.max(0,seconds-previous);previous=seconds;plans=0;
    // Frame-rate independent bounded integration; hidden tabs pause decorative
    // journeys instead of jumping vehicles across districts on return.
    let rest=Math.min(3,delta);while(rest>1e-8){const dt=Math.min(1/30,rest);step(dt);rest-=dt;}
  },clock:()=>previous,preserve(priorState: {actors:JourneyActor[]; report?:()=>{elapsed:number};clock?:()=>number}) {
    time=priorState.report?.().elapsed??time;previous=priorState.clock?.()??previous;
    priorState.actors.forEach((old,i)=>{const actor=actors[i];if(!actor||!graph.nodes.has(old.node)||(old.target&&!graph.nodes.has(old.target)))return;
      Object.assign(actor,old,{position:{...old.position},route:old.route.map(p=>({...p})),recent:[...old.recent],destinations:[...old.destinations],history:[...old.history]});
    });
  },report:()=>({kind:graph.kind,decorative:true,elapsed:time,actors:actors.map(a=>({id:a.id,position:{...a.position},heading:a.heading,state:a.state,
    node:a.node,target:a.target,component:graph.component.get(a.node),speed:a.speed,traveled:a.traveled,completed:a.completed,destinations:[...a.destinations],history:[...a.history]}))})};
}
