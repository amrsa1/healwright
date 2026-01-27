import { Page } from "playwright-core";

export default class LoginPage {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /********************************************************** Elements ********************************************************* */

  get signOutLinkText() {
    return this.page.getByRole("link", { name: "sign out" });
  }

  get submitButton() {
    return this.page.locator("#submitFeedback").first();
  }

  get usernameInput() {
    return this.page.locator("#username");
  }
  get passwordInput() {
    return this.page.locator("#password");
  }

  get signInButton() {
    return this.page.locator('[type="submit"]');
  }

  /********************************************************** Actions ********************************************************* */

  async loginWith(username: string, password: string) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.signInButton.click();
  }

}
