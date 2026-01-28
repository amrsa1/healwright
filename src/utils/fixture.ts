import { test as base } from "@playwright/test";
import FeedbackPage from "../pages/feedbackPageNew";
import DataProvider from "./dataProvider";
import LoginPage from "../pages/loginPage";
import API from "./apiUtils";
import { withHealing, HealPage } from "./healPage";

type MyFixtures = {
  page: HealPage;
  feedbackPage: FeedbackPage;
  dataProvider: DataProvider;
  api: API;
  loginPage: LoginPage;
};

const fixtures = base.extend<MyFixtures>({
  // Override page with healing capabilities
  page: async ({ page }, use, testInfo) => {
    const healPage = withHealing(page);
    healPage.heal.setTestName(testInfo.title);
    await use(healPage);
  },
  feedbackPage: async ({ page }, use) => {
    const feedbackPage = new FeedbackPage(page);
    await use(feedbackPage);
  },
  loginPage: async ({ page }, use) => {
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
