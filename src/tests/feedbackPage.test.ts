import { expect } from "@playwright/test";
import { fixtures as test } from "../utils/fixture";

test.describe("Feedback page test suite", () => {
  test.beforeEach(async ({ page }) => {
    // await page.context().addCookies([
    //   {
    //     name: "accessToken",
    //     value: `${process.env.accessToken}`,
    //     url: "http://localhost:3001",
    //   },
    // ]);
    await page.goto("/feedback");
  });

  test("[Mobile/Desktop] Should have header with all relevant items in feedback page", async ({ feedbackPage }) => {
    await expect
      .soft(feedbackPage.qaWorldHeaderText)
      .toBeVisible();
    await expect.soft(feedbackPage.signOutLinkText).toBeVisible();
  });

  test("[Mobile/Desktop] Should have feedback wall heading", async ({ feedbackPage }) => {
    await expect(feedbackPage.feedbackWallHeading).toBeVisible();
  });

  test("[Mobile/Desktop] Should be able to submit new feedback", async ({ feedbackPage, page, dataProvider }) => {
    const title = await dataProvider.generateRandomString("title");
    const comment = await dataProvider.generateRandomString("comment");

    await feedbackPage.openFeedbackModal();
    await feedbackPage.fillFeedBackForm(title, comment, "khal");
    await feedbackPage.submitFeedback();
    await expect.soft(page.getByText(title).first()).toBeVisible();
    await expect.soft(page.getByText(comment).first()).toBeVisible();
  });

  test("[Mobile/Desktop] Should not be able to submit new feedback with missing title", async ({ feedbackPage }) => {
    await feedbackPage.openFeedbackModal();
    await feedbackPage.fillFeedBackForm("", "comment", "khal");
    await feedbackPage.submitFeedback();
    await expect(feedbackPage.getText("Please enter a title for your feedback")).toBeVisible();
  });

  test("[Mobile/Desktop] Should not be able to submit new feedback with missing comment", async ({ feedbackPage }) => {
    await feedbackPage.openFeedbackModal();
    await feedbackPage.fillFeedBackForm("title", "", "khal");
    await feedbackPage.submitFeedback();
    await expect(feedbackPage.getText("Please provide feedback content")).toBeVisible();
  });

  test("[Mobile/Desktop] Should not be able to submit new feedback with missing receiver", async ({ feedbackPage }) => {
    await feedbackPage.openFeedbackModal();
    await feedbackPage.fillFeedBackForm("title", "comment", "");
    await feedbackPage.submitFeedback();
    await expect(feedbackPage.getText("Please select a receiver for your feedback")).toBeVisible();
  });
});
