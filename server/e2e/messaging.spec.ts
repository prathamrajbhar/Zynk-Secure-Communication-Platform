import { test, expect } from '@playwright/test';

test.describe('E2EE Messaging Flow', () => {
    const userA = {
        username: `user_a_${Date.now()}`,
        password: 'Password123!',
        name: 'User Alpha'
    };
    const userB = {
        username: `user_b_${Date.now()}`,
        password: 'Password123!',
        name: 'User Beta'
    };

    test('should register two users and exchange encrypted messages', async ({ page }) => {
        // 1. Register User A
        console.log(`Registering User A: ${userA.username}`);
        await page.goto('/register');
        await page.fill('placeholder="Choose a username"', userA.username);
        await page.fill('placeholder="Create a password"', userA.password);
        await page.fill('placeholder="Re-enter password"', userA.password);
        await page.click('text="Create Account"');
        await expect(page).toHaveURL('/chat', { timeout: 10000 });

        // Wait for crypto keys to be generated (stored in IndexedDB)
        await page.waitForTimeout(3000);

        // Logout
        await page.click('button:has(svg.lucide-more-vertical)');
        await page.click('text="Log out"');
        await expect(page).toHaveURL('/login');

        // 2. Register User B
        console.log(`Registering User B: ${userB.username}`);
        await page.goto('/register');
        await page.fill('placeholder="Choose a username"', userB.username);
        await page.fill('placeholder="Create a password"', userB.password);
        await page.fill('placeholder="Re-enter password"', userB.password);
        await page.click('text="Create Account"');
        await expect(page).toHaveURL('/chat', { timeout: 10000 });
        await page.waitForTimeout(3000);

        // Logout
        await page.click('button:has(svg.lucide-more-vertical)');
        await page.click('text="Log out"');
        await expect(page).toHaveURL('/login');

        // 3. Login User A and send message to User B
        console.log(`Logging in as User A to send message`);
        await page.fill('placeholder="Enter your username"', userA.username);
        await page.fill('placeholder="Enter your password"', userA.password);
        await page.click('text="Sign In"');
        await expect(page).toHaveURL('/chat');

        // Start chat with User B
        await page.fill('placeholder="Search chats, people, messages..."', userB.username);
        // Wait for search results
        await page.waitForSelector(`text="${userB.username}"`);
        await page.click(`text="${userB.username}"`);

        // Send message
        const messageAToB = 'Hello User Beta, this is a secure message!';
        await page.fill('placeholder="Type a message..."', messageAToB);
        await page.keyboard.press('Enter');

        // Verify it appears in own chat
        await expect(page.locator(`text="${messageAToB}"`)).toBeVisible();

        // Logout
        await page.click('button:has(svg.lucide-more-vertical)');
        await page.click('text="Log out"');

        // 4. Login User B and verify decryption
        console.log(`Logging in as User B to verify decryption`);
        await page.fill('placeholder="Enter your username"', userB.username);
        await page.fill('placeholder="Enter your password"', userB.password);
        await page.click('text="Sign In"');
        await expect(page).toHaveURL('/chat');

        // Select conversation with User A
        await page.click(`text="${userA.username}"`);

        // Verify message is decrypted (not raw JSON)
        const receivedMessage = page.locator(`text="${messageAToB}"`);
        await expect(receivedMessage).toBeVisible();

        // Check that it's NOT JSON
        const content = await receivedMessage.textContent();
        expect(content).not.toContain('{"ciphertext":');
        console.log('User B successfully decrypted message from User A');

        // Send reply
        const replyBToA = 'I got it! Decryption is working perfectly.';
        await page.fill('placeholder="Type a message..."', replyBToA);
        await page.keyboard.press('Enter');
        await expect(page.locator(`text="${replyBToA}"`)).toBeVisible();

        // Logout
        await page.click('button:has(svg.lucide-more-vertical)');
        await page.click('text="Log out"');

        // 5. Login User A and verify reply decryption
        console.log(`Logging in as User A to verify reply`);
        await page.fill('placeholder="Enter your username"', userA.username);
        await page.fill('placeholder="Enter your password"', userA.password);
        await page.click('text="Sign In"');
        await expect(page).toHaveURL('/chat');

        await page.click(`text="${userB.username}"`);
        const receivedReply = page.locator(`text="${replyBToA}"`);
        await expect(receivedReply).toBeVisible();

        const replyContent = await receivedReply.textContent();
        expect(replyContent).not.toContain('{"ciphertext":');
        console.log('User A successfully decrypted reply from User B');
    });
});
