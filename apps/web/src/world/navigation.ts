/** Renderer navigation data only. No ownership, tasks, credits or economic commands. */
export type NavPoint = { x: number; y: number; z: number; heading?: number };
export type NavEdge = { to: string; cost: number; points?: NavPoint[]; curve?: Float32Array };
export interface NavigationGraph {
  preferred?: string[];
  kind: "pedestrian" | "vehicle" | "water";
  nodes: Map<string, NavPoint>; edges: Map<string, NavEdge[]>;
  component: Map<string, number>; components: string[][];
}
export const distance = (a: NavPoint, b: NavPoint) => Math.hypot(a.x - b.x, a.z - b.z, a.y - b.y);
export const navKey = (x: number, z: number, step = 1) => `${Math.round(x / step)}:${Math.round(z / step)}`;

/** Strong components keep directed traffic out of irreversible dead ends. Iterative
 * Kosaraju also works for symmetric pedestrian/water graphs, without recursion. */
export function connectGraph(kind: NavigationGraph["kind"], nodes: NavigationGraph["nodes"], edges: NavigationGraph["edges"]): NavigationGraph {
  const seen = new Set<string>(), order: string[] = [], reverse = new Map<string, string[]>();
  for (const [from, list] of edges) for (const edge of list) {
    const previous = reverse.get(edge.to) ?? []; previous.push(from); reverse.set(edge.to, previous);
  }
  for (const start of nodes.keys()) {
    if (seen.has(start)) continue;
    const stack: [string, boolean][] = [[start, false]];
    while (stack.length) {
      const [id, done] = stack.pop()!;
      if (done) { order.push(id); continue; }
      if (seen.has(id)) continue;
      seen.add(id); stack.push([id, true]);
      for (const e of edges.get(id) ?? []) if (!seen.has(e.to)) stack.push([e.to, false]);
    }
  }
  const component = new Map<string, number>(), components: string[][] = [];
  for (const start of order.reverse()) {
    if (component.has(start)) continue;
    const members: string[] = [], stack = [start], index = components.length;
    component.set(start, index);
    while (stack.length) {
      const id = stack.pop()!; members.push(id);
      for (const previous of reverse.get(id) ?? []) if (!component.has(previous)) { component.set(previous, index); stack.push(previous); }
    }
    components.push(members);
  }
  return { kind, nodes, edges, component, components };
}
export function gridGraph(kind: NavigationGraph["kind"], nodes: Map<string, NavPoint>, step = 1, diagonal = false) {
  const edges = new Map<string, NavEdge[]>();
  const spatial = new Map([...nodes].map(([id,p])=>[navKey(p.x,p.z,step),id]));
  const offsets = [[1, 0], [-1, 0], [0, 1], [0, -1], ...(diagonal ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : [])];
  for (const [id, p] of nodes) {
    const list: NavEdge[] = [];
    for (const [dx, dz] of offsets) {
      const next = spatial.get(navKey(p.x + dx! * step, p.z + dz! * step, step)), to = next ? nodes.get(next) : undefined;
      if (!to || (dx && dz && (!spatial.has(navKey(p.x + dx * step, p.z, step)) || !spatial.has(navKey(p.x, p.z + dz * step, step))))) continue;
      list.push({ to: next!, cost: distance(p, to) });
    }
    edges.set(id, list);
  }
  return connectGraph(kind, nodes, edges);
}
export function nearestNode(graph: NavigationGraph, point: Pick<NavPoint, "x" | "z">, component?: number) {
  let best: string | null = null, span = Infinity;
  for (const id of component === undefined ? graph.nodes.keys() : graph.components[component] ?? []) {
    const p = graph.nodes.get(id)!, d = (p.x - point.x) ** 2 + (p.z - point.z) ** 2;
    if (d < span) { best = id; span = d; }
  }
  return best;
}
/** Binary-heap A*. Search cost is bounded; callers stagger requests and cache
 * destination choices. Every returned segment belongs to a real graph edge. */
export function findRoute(graph: NavigationGraph, start: string, goal: string, budget = 30000, blocked?: (id: string) => boolean): NavPoint[] | null {
  if (!graph.nodes.has(start) || !graph.nodes.has(goal)) return null;
  const target = graph.nodes.get(goal)!, costs = new Map([[start, 0]]), previous = new Map<string, { id: string; edge: NavEdge }>();
  const heap: { id: string; score: number; cost: number }[] = [];
  const push = (item: typeof heap[number]) => {
    heap.push(item); let i = heap.length - 1;
    while (i) { const parent = (i - 1) >> 1; if (heap[parent]!.score <= item.score) break; heap[i] = heap[parent]!; i = parent; } heap[i] = item;
  };
  const pop = () => {
    const first = heap[0]!, last = heap.pop()!;
    if (heap.length) { let i = 0;
      while (i * 2 + 1 < heap.length) { let child = i * 2 + 1; if (child + 1 < heap.length && heap[child + 1]!.score < heap[child]!.score) child++;
        if (heap[child]!.score >= last.score) break; heap[i] = heap[child]!; i = child; }
      heap[i] = last;
    } return first;
  };
  push({ id: start, score: distance(graph.nodes.get(start)!, target), cost: 0 });
  for (let visited = 0; heap.length && visited < budget; visited++) {
    const current = pop(); if (current.cost !== costs.get(current.id)) continue;
    if (current.id === goal) {
      const segments: NavPoint[][] = []; let id = goal;
      while (id !== start) { const p = previous.get(id)!; const curve=p.edge.curve;
        segments.push(curve ? Array.from({length:curve.length/4},(_,i)=>({x:curve[i*4]!,y:curve[i*4+1]!,z:curve[i*4+2]!,heading:curve[i*4+3]!})) : p.edge.points ?? [graph.nodes.get(p.id)!, graph.nodes.get(id)!]); id = p.id; }
      return [graph.nodes.get(start)!, ...segments.reverse().flatMap((points) => points.slice(1))].map((p) => ({ ...p }));
    }
    for (const edge of graph.edges.get(current.id) ?? []) {
      if (blocked?.(edge.to) && edge.to !== start) continue;
      const cost = current.cost + edge.cost;
      if (cost >= (costs.get(edge.to) ?? Infinity)) continue;
      costs.set(edge.to, cost); previous.set(edge.to, { id: current.id, edge });
      push({ id: edge.to, score: cost + distance(graph.nodes.get(edge.to)!, target), cost });
    }
  }
  return null;
}
export function graphReport(graph: NavigationGraph) {
  return { kind: graph.kind, nodes: graph.nodes.size, edges: [...graph.edges.values()].reduce((n, e) => n + e.length, 0),
    components: graph.components.map((c) => c.length).sort((a, b) => b - a).slice(0, 32) };
}
