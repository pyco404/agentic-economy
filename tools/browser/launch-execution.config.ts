import base from '../../apps/web/playwright.launchpad.config';
process.env.AGENT_WORK_API_URL='http://127.0.0.1:8796';
export default {...base,webServer:(Array.isArray(base.webServer)?base.webServer:[]).map(server=>({...server,cwd:new URL('../../apps/web',import.meta.url).pathname})),testDir:new URL('../../apps/web/tests',import.meta.url).pathname,testMatch:'launch-execution.spec.ts',outputDir:new URL('../../apps/web/artifacts/local-mint-execution',import.meta.url).pathname};
