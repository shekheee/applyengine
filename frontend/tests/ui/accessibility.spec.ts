import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("public authentication surface", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".login-rise")].every(
        (element) =>
          element.getClientRects().length === 0 || getComputedStyle(element).opacity === "1"
      )
    );
  });

  test("is login-only and has no horizontal overflow", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
    await expect(page.getByText(/sign up|create account/i)).toHaveCount(0);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);
  });

  test("has no automatically detectable accessibility violations", async ({ page }) => {
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
