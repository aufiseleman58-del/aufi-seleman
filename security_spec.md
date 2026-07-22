# Security Specification - Zathu Wallet

## 1. Data Invariants
- **Identity Consistency**: Any resource created with a `userId`, `authorId`, `senderId`, `fromId`, or `sellerId` field must match `request.auth.uid`.
- **Relational Integrity**: Notifications, Followers, Following, and SavedPosts must belong to the user identified in the path.
- **Wallet Invariant**: A wallet's `userId` must match its document ID and `request.auth.uid`. Balance must never be negative.
- **Transaction Invariant**: A transaction must involve the current user either as `fromId` or `toId`.
- **Admin Invariant**: Only users with `role: 'admin'` or the hardcoded developer email `aufiseleman58@gmail.com` (verified) can modify system-level fields or other users' data.
- **Immutability**: Fields like `createdAt`, `userId`, `authorId` must remain unchanged after creation.
- **Temporal Integrity**: All timestamps (`createdAt`, `updatedAt`, `lastSeen`) must use `serverTimestamp()`.

## 2. The "Dirty Dozen" Payloads

1. **Identity Spoofing (Create Post)**: Trying to create a post with `authorId` as someone else.
2. **Privilege Escalation (User Profile)**: Trying to set own `role` to `'admin'`.
3. **Ghost Field Injection (Wallet)**: Trying to update wallet with `isVIP: true`.
4. **Balance Manipulation (Wallet)**: Trying to update wallet balance directly without a transaction.
5. **Unauthorized Following**: Trying to add a follow record to someone else's following list.
6. **Notification Spam**: Trying to bulk create notifications for another user without being an admin.
7. **Savings Pool Hijack**: Trying to update a savings pool's `creatorId`.
8. **Shadow Update (Transaction)**: Trying to change a completed transaction's `amount`.
9. **PII Breach**: Trying to `list` all users to scrape emails.
10. **ID Poisoning**: Trying to create a document with a 1MB string as ID.
11. **Email Spoofing**: Trying to log in as admin with an unverified email.
12. **Cross-User savedPosts listing**: Trying to list another user's saved posts.

## 3. Test Runner (Draft)
A complete `firestore.rules.test.ts` would involve testing each of these cases using the `@firebase/rules-unit-testing` framework. (Implementation truncated for brevity, but logic will be followed in rules generation).
