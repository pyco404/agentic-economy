import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMIqEj5DwAEdAIsaPTzigAAAABJRU5ErkJggg==", "base64");
const logo = { name: "token.png", mimeType: "image/png", buffer: png };

for (const width of [1440, 820, 390]) test(`logo preview, validation and honest backend-unavailable state at ${width}px`, async ({ page }) => {
  test.setTimeout(180000); await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const writes: string[] = [];
  page.on("request", (r) => { if (r.method() !== "GET") writes.push(r.url()); });
  await page.goto("/?source=backend#launchpad");
  const input = page.getByLabel("Token logo file", { exact: true });
  await input.setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("<svg>unsafe</svg>") });
  await expect(page.getByRole("alert")).toContainText("genuine PNG");
  await input.setInputFiles({ name: "too-large.png", mimeType: "image/png", buffer: Buffer.alloc(5_000_001) });
  await expect(page.getByRole("alert")).toContainText("smaller than 5 MB");
  await input.setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]) });
  await expect(page.getByRole("alert")).toContainText("corrupted");
  await input.setInputFiles(logo);
  await expect(page.getByAltText("Token logo preview")).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload to IPFS", exact: true })).toBeDisabled();
  await expect(page.getByText(/awaiting the authenticated backend API/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Wallet signing unavailable" })).toBeDisabled();
  await page.getByLabel("Token name", { exact: true }).fill("Logo review");
  await page.getByLabel("Symbol", { exact: true }).fill("LOGO");
  await page.getByRole("button", { name: "Close page and view city" }).press("Enter");
  await page.getByRole("button", { name: "Show page", exact: true }).press("Enter");
  await expect(page.getByAltText("Token logo preview")).toBeVisible();
  await page.screenshot({ path: `artifacts/launch-logo-preview-${width}.png` });
  await page.reload();
  await expect(page.getByText(/Select token.png again to upload it/)).toBeVisible();
  await expect(page.getByLabel("Token name", { exact: true })).toHaveValue("Logo review");
  await page.getByLabel("Token logo file", { exact: true }).setInputFiles(logo);
  await page.getByRole("button", { name: "Remove image", exact: true }).click();
  await expect(page.getByAltText("Token logo preview")).toHaveCount(0);
  await page.getByText("Advanced image and metadata settings", { exact: true }).click();
  await expect(page.getByLabel("Image URL", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Metadata URL", { exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(writes).toEqual([]);
});

test("isolated adapter fixture covers progress, duplicate guard, retry, cancellation and fresh metadata", async ({ page }) => {
  test.setTimeout(120000);
  // Ignored test-only module: never imported by the production app or build.
  mkdirSync("artifacts", { recursive: true });
  writeFileSync("artifacts/launch-logo-harness.tsx", `
    import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { LaunchLogoUpload } from '../src/components/LaunchLogoUpload';
    import '../src/styles.css';
    const cid = 'bafybeihgxdzljxb26q6nf3r3eifqeedsvt2eubqtskghpme66cgjyw4fra';
    const metaCid = 'bafkreicnu2aqjkoglrlrd65giwo4l64pdajxffk6jtq2vb7yaiopc3yu7m';
    const ref = (id) => ({cid:id,ipfsUri:'ipfs://'+id,gatewayUrl:'https://ipfs.io/ipfs/'+id});
    window.mediaReview = { uploads: 0, metadata: [], fail: true, hold: false, failMetadata: true };
    const adapter = { available:true,
      async uploadLogo(file, options) {
        window.mediaReview.uploads++; options.onProgress(25);
        if(window.mediaReview.hold) return new Promise(()=>{});
        await new Promise(r=>setTimeout(r,500)); options.onProgress(75);
        if(window.mediaReview.fail) throw new Error('fixture rejection');
        return {...ref(cid),status:'verified',uploadId:'test-only-upload'};
      },
      async prepareMetadata(input) { window.mediaReview.metadata.push(input);
        if(window.mediaReview.failMetadata) throw new Error('fixture metadata rejection');
        return ref(metaCid);
      }
    };
    function Harness(){
      const [imageUrl,onImage]=useState(''),[name,setName]=useState('Fixture token');
      window.changeFixtureName=setName;
      return <main className="surface"><h1>Isolated test fixture — no real uploads</h1><LaunchLogoUpload name={name} symbol="TEST" description="Browser-only fixture" quoteAsset="SOL" imageUrl={imageUrl} onImage={onImage} adapter={adapter}/></main>;
    }
    createRoot(document.getElementById('fixture')).render(<Harness/>);
  `);
  await page.route("**/__launch-logo-test", (route) => route.fulfill({ contentType: "text/html", body: `<div id="fixture"></div>
    <script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      await import('/artifacts/launch-logo-harness.tsx');
    </script>` }));
  await page.goto("/__launch-logo-test");
  await page.getByLabel("Token logo file", { exact: true }).setInputFiles(logo);
  const upload = page.getByRole("button", { name: "Upload to IPFS", exact: true });
  await upload.evaluate((node: HTMLButtonElement) => { node.click(); node.click(); });
  await expect(page.getByRole("progressbar")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Upload failed");
  expect(await page.evaluate(() => (window as any).mediaReview.uploads)).toBe(1);
  await page.evaluate(() => { (window as any).mediaReview.fail = false; (window as any).mediaReview.hold = true; });
  await page.getByRole("button", { name: "Retry upload" }).click();
  await page.getByRole("button", { name: "Cancel upload" }).click();
  await expect(page.getByRole("alert")).toContainText("cancelled");
  await page.evaluate(() => { (window as any).mediaReview.hold = false; });
  await page.getByRole("button", { name: "Retry upload" }).click();
  await expect(page.getByText("Logo uploaded and verified. No token launched.")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Metadata preparation failed");
  await page.evaluate(() => { (window as any).mediaReview.failMetadata = false; });
  await page.getByRole("button", { name: "Retry metadata" }).click();
  await expect(page.getByLabel("Metadata readiness")).toContainText("Metadata prepared");
  await page.evaluate(() => (window as any).changeFixtureName("Latest token name"));
  await expect.poll(async () => page.evaluate(() => (window as any).mediaReview.metadata.at(-1).name)).toBe("Latest token name");
  await expect(page.getByLabel("Metadata readiness")).toContainText("Metadata prepared");
  const saved = await page.evaluate(() => Object.fromEntries(Object.keys(sessionStorage).map((key) => [key, sessionStorage.getItem(key)])));
  expect(JSON.stringify(saved)).not.toContain("data:image"); expect(JSON.stringify(saved)).not.toContain("blob:");
  expect(JSON.stringify(saved)).toContain("ipfs://");
  await page.getByRole("button", { name: "Remove image" }).click();
  await expect(page.getByAltText("Token logo preview")).toHaveCount(0);
  await expect(page.getByLabel("Metadata readiness")).toContainText("not ready");
});
