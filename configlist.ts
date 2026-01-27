const configList = {
  headless: process.env.CI ? false : false,
  browser: process.env.CI ? "x" : "chrome",
  ignoreHTTPSErrors: true,
  fullyParallel: true,
  acceptDownloads: false,
  screenshot: "only-on-failure",
  video: "retain-on-failure",
  baseUrl: "http://localhost:3001",
  apiBaseUrl: "http://localhost:3022",
  reporter: [["list"], ["html", { open: "never" }]],
  workers: process.env.CI ? 1 : 1,
  testTimeOut: process.env.CI ? 60000 : 90000,
  navigationTimeOut: process.env.CI ? 10000 : 7000,
  assertionTimeout: process.env.CI ? 10000 : 6000,
  actionTimeout: process.env.CI ? 10000 : 3000,
  retries: process.env.CI ? 0 : process.env.SELF_HEAL === "1" ? 1 : 0,
  testDir: "./src/tests",
  specs: process.env.CI ? ["*"] : [
    // "loginPage.test.ts", 
    "feedbackPage.test.ts",
    // "feedbackAPI.test.ts"
  ],
  devtools: true,
  credential: {
    username: process.env.BASIC_USERNAME as string,
    password: process.env.BASIC_PASSWORD as string,
  },
};

export default configList;
