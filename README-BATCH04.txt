PRAKIVA Wishlist Batch 04 — items #6 (audit) and #8 (test framework removal)

Copy package.json, package-lock.json and vite.config.ts into project root.
Delete src/setupTests.ts (obsolete test setup file).
Then run: npm install
           npm run build
           npx cap sync android

No changes to android/.
Audit of src/*.ts and src/*.tsx found no obvious demo/dummy UI text to remove.
Retained legitimate field placeholders, validation messages, and controller references.
Removed Vitest, Testing Library, jsdom, test.unit script, Vitest type reference.
No runtime dependencies removed.
