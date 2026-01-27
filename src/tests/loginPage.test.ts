import { expect } from "@playwright/test";
import configList from "../../configlist";
import { fixtures as test } from "../utils/fixture";

test.describe("Login page test suite", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("[Mobile/Desktop] Should not be able to access feedback page for Un-authenticated user", async ({ page }) => {
    await page.goto("/feedback");
    await expect(page).not.toHaveURL(/.*feedback/);
  });

  test("[Mobile/Desktop] Should not be able to login with invalid credential", async ({ page, loginPage }) => {
    await loginPage.loginWith("anything", "anything");
    await expect(page.getByText("Wrong username or password")).toBeVisible();
  });

  test("[Mobile/Desktop] Should not be able to login with missing password", async ({ page, loginPage }) => {
    await loginPage.loginWith("anything", "");
    await expect(page).not.toHaveURL(/.*feedback/);
  });

  test("[Mobile/Desktop] Should not be able to login with missing username", async ({ page, loginPage }) => {
    await loginPage.loginWith("", "anything");
    await expect(page).not.toHaveURL(/.*feedback/);
  });

  test("[Mobile/Desktop] Should be able to login with valid credentials", async ({ page, loginPage }) => {
    await loginPage.loginWith(configList.credential.username, configList.credential.password);
    await expect(page).toHaveURL(/.*feedback/);
  });
});
