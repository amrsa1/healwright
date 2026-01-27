import { Page } from "playwright-core";
import { heal } from "../utils/heal";

export default class FeedbackPage {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /********************************************************** Elements ********************************************************* */

  get qaWorldHeaderText() {
    return this.page.getByRole("link", { name: "QA World by Amr" });
  }

  get feedbackModalHeader() {
    return this.page.getByText("Share constructive feedback with your peers");
  }

  getText(text: string) {
    return this.page.getByText(text);
  }

  get signOutLinkText() {
    return this.page.getByRole("button", { name: "Logout" });
  }

  get feedbackWallHeading() {
    return this.page.getByRole("heading", { name: "Feedback Wall" });
  }

  get createNewButton() {
    // BROKEN: wrong test id
    return this.page.locator('[data-test-id="broken-create-btn"]');
  }

  get titleInput() {
    // BROKEN: wrong role
    // return this.page.getByRole("searchbox").first();
        return this.page.locator('//input[@placeholder="Enter feedback title"]');

  }

  get commentInput() {
    // BROKEN: wrong index
    return this.page.getByRole("textbox").nth(99);
  }

  get receiverDropdown() {
    // BROKEN: wrong selector
    return this.page.locator("select#nonexistent").first();
  }

  receiverName(name: string) {
    return this.page.getByTestId(`${name}`).first();
  }

  get submitButton() {
    // BROKEN: wrong button name
    return this.page.getByRole("button", { name: /send-broken/i });
  }

  /********************************************************** Actions ********************************************************* */

  async openFeedbackModal() {
    await heal.click(this.page, this.createNewButton, "Create new feedback button");
  }

  async fillFeedBackForm(title: string, comment: string, name: string) {
    if (title) {
      await heal.fill(this.page, this.titleInput, "Feedback title input", title);
    }
    if (comment) {
      await heal.fill(this.page, this.commentInput, "Feedback comment input", comment);
    }
    if (name) {
      await heal.selectOption(this.page, this.receiverDropdown, "Feedback receiver dropdown", name);
    }
  }

  async submitFeedback() {
    await heal.click(this.page, this.submitButton, "Submit feedback button");
  }
}
