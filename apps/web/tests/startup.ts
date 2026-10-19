import { expect, type Page } from '@playwright/test';

/** Page controls are intentionally unavailable until the fresh world's reveal finishes. */
export async function waitForApplicationReady(page: Page) {
  await expect(page.getByTestId('application-startup')).toHaveAttribute('data-startup-state', 'ready', { timeout: 150000 });
}
