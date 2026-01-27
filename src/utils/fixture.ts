import { test as base } from "@playwright/test";
import FeedbackPage from "../pages/feedbackPage";
import DataProvider from "./dataProvider";
import LoginPage from "../pages/loginPage";
import API from "./apiUtils";
import { heal } from "./heal";

type MyFixtures = {
  feedbackPage: FeedbackPage;
  dataProvider: DataProvider;
  api: API;
  loginPage: LoginPage;
};

const fixtures = base.extend<MyFixtures>({
  feedbackPage: async ({ page }, use, testInfo) => {
    // Set test name for self-healing cache metadata
    heal.setTestName(testInfo.title);
    const feedbackPage = new FeedbackPage(page);
    await use(feedbackPage);
  },
  loginPage: async ({ page }, use, testInfo) => {
    // Set test name for self-healing cache metadata
    heal.setTestName(testInfo.title);
    await page.evaluate(() => window.localStorage.clear());
    await page.evaluate(() => window.sessionStorage.clear());
    const loginPage = new LoginPage(page);
    await use(loginPage);
  },
  api: async ({ }, use) => {
    const api = new API();
    await use(api);
  },
  dataProvider: async ({ }, use) => {
    const dataProvider = new DataProvider();
    await use(dataProvider);
  },
});

export { fixtures };
