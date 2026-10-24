import { defineConfig } from '@playwright/test';
// Start the isolated backend/frontend using the documented local prototype commands first.
export default defineConfig({testDir:'tests',testMatch:'autonomy.spec.ts',workers:1,timeout:180000,expect:{timeout:30000},outputDir:'/tmp/aeco-autonomy-browser',
 use:{baseURL:'http://127.0.0.1:5186',hasTouch:true,deviceScaleFactor:.5,viewport:{width:1440,height:1000},launchOptions:{executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--enable-gpu','--use-gl=angle','--use-angle=gl','--ignore-gpu-blocklist']}}});
