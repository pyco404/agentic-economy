import { prepareScenery, type SceneryRequest, type SceneryMessage } from "./sceneryPlan";
const scope = globalThis as unknown as { onmessage: (event: MessageEvent<SceneryRequest>) => void; postMessage: (message: SceneryMessage) => void };
scope.onmessage = ({ data }) => {
  try { prepareScenery(data, (message) => scope.postMessage(message)); }
  catch (error) { scope.postMessage({ kind: "error", revision: data.revision, error: error instanceof Error ? error.message : "Scenery preparation failed" }); }
};
