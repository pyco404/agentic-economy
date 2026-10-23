import type { Page } from '@playwright/test';

/** Camera-action tests reveal the controls through the same compact toolbar as visitors. */
export async function expandWorldControls(page: Page) {
  const toggle = page.getByRole('button', {name:/^(Expand|Collapse) controls$/});
  await toggle.waitFor({state:'visible'});
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
}
