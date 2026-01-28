/**
 * healwright
 * 
 * AI-powered self-healing locators for Playwright tests.
 * When locators fail, the AI automatically finds the correct element.
 * 
 * @example
 * ```typescript
 * import { withHealing, HealPage } from 'healwright';
 * 
 * // In your page object or test
 * const page = withHealing(browserPage);
 * 
 * // Use with locators (heals if fails)
 * await page.heal.click(page.getByRole('button'), 'Submit button');
 * 
 * // Or let AI find elements by description alone
 * await page.heal.click('', 'Submit button');
 * await page.heal.fill('', 'Email input', 'test@example.com');
 * ```
 */

export { 
  withHealing, 
  createHealingFixture,
  HealPage, 
  HealMethods, 
  HealOptions 
} from './healPage';

// For backward compatibility with the old API
export { heal, createHealer } from './heal';
