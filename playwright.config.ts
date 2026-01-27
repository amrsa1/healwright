import dotenv from "dotenv";
dotenv.config({ path: ".env" });
import { devices, PlaywrightTestConfig } from "@playwright/test";
import configList from "./configlist";

const project = () => {
  switch (configList.browser) {
    case "chrome":
      return [
        {
          name: "Chrome",
          use: { browserName: "chromium", locale: "en" },
          grep: [/^(?!(.*Mobile|.*API)).*$/, /Mobile\/Desktop/],
        },
      ];
    case "edge":
      return [{ name: "Edge", use: { channel: "msedge" }, grep: [/^(?!(.*Mobile|.*API)).*$/, /Mobile\/Desktop/] }];
    case "firefox":
      return [{ name: "Firefox", use: { browserName: "firefox", locale: "" } }];
    case "safari":
      return [
        {
          name: "Safari",
          use: { browserName: "webkit", locale: "", viewport: { width: 1366, height: 768 } },
          grep: [/^(?!(.*Mobile|.*API)).*$/, /Mobile\/Desktop/],
        },
      ];
    case "x":
      return [
        {
          name: "API test",
          grep: /.*\[API\].*/,
        },
        {
          name: "Chrome",
          use: {
            browserName: "chromium",
          },
          grep: [/^(?!(.*Mobile|.*API)).*$/, /Mobile\/Desktop/],
        },
        {
          name: "Chrome - Pixel 5",
          use: {
            ...devices["Pixel 5"],
            browserName: "chromium",
          },
          grep: /Mobile/,
        }
      ];
    default:
      throw new Error("No valid parameter has been set for browser!");
  }
};

const sharedConfig: PlaywrightTestConfig = {
  globalSetup: "./src/utils/auth",
  workers: configList.workers,
  use: {
    headless: configList.headless,
    baseURL: configList.baseUrl,
    trace: "retain-on-failure",
    ignoreHTTPSErrors: configList.ignoreHTTPSErrors,
    acceptDownloads: configList.acceptDownloads,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    navigationTimeout: configList.navigationTimeOut,
    actionTimeout: configList.actionTimeout,
    storageState: {
      cookies: [
        {
          name: "accessToken",
          value: `${process.env.accessToken}`,
          domain: "localhost",
          path: "/",
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: "Strict",
        },
      ],
      origins: [
        {
          origin: configList.baseUrl,
          localStorage: [{ name: "accessToken", value: process.env.accessToken as string }],
        },
      ],
    },
    httpCredentials: {
      username: configList.credential.username,
      password: configList.credential.password,
    },
  },
  outputDir: "test-results",
  projects: project() as [],
  expect: { timeout: configList.assertionTimeout },
  testDir: configList.testDir,
  reporter: configList.reporter as [],
  timeout: configList.testTimeOut,
  retries: configList.retries,
  fullyParallel: configList.fullyParallel,
  testMatch: configList.specs,
};

export default sharedConfig;
