import { Page } from "playwright-core";
import { withHealing, HealPage } from "../utils/healPage";

export default class FeedbackPage {
  private page: HealPage;

  constructor(page: Page) {
    // Enhance page with healing capabilities
    this.page = withHealing(page);
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
    // Option 1: With locator (heals if locator fails)
    await this.page.heal.click(this.createNewButton, "Create new feedback button");
    
    // Option 2: AI-only detection (no locator needed!)
    // await this.page.heal.click("", "Create new feedback button");
  }

  async fillFeedBackForm(title: string, comment: string, name: string) {
    if (title) {
      // With locator
      await this.page.heal.fill(this.titleInput, "Feedback title input", title);
      
      // Or AI-only:
      // await this.page.heal.fill("", "Feedback title input", title);
    }
    if (comment) {
      await this.page.heal.fill(this.commentInput, "Feedback comment input", comment);
    }
    if (name) {
      await this.page.heal.selectOption(this.receiverDropdown, "Feedback receiver dropdown", name);
    }
  }

  async submitFeedback() {
    await this.page.heal.click(this.submitButton, "Submit feedback button");
  }
}
