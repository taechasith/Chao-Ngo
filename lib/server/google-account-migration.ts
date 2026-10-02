/** Called only with the Google profile returned by the server-side OAuth exchange. */
export async function verifyLegacyGoogleAccount(database: D1Database, profile: { email?: string; email_verified?: boolean }) {
  if (profile.email_verified !== true || !profile.email) return;
  const email = profile.email.trim().toLowerCase();
  const legacy = await database.prepare('SELECT id FROM "user" WHERE email = ? AND emailVerified = 0').bind(email).first<{ id: string }>();
  if (!legacy) return;
  // Keep the user ID and progress, but invalidate sessions created before Google proved ownership.
  // Email/password endpoints are disabled; a stored legacy password cannot sign in.
  await database.batch([
    database.prepare('DELETE FROM session WHERE userId = ?').bind(legacy.id),
    database.prepare('UPDATE "user" SET emailVerified = 1, updatedAt = ? WHERE id = ? AND email = ? AND emailVerified = 0').bind(Date.now(), legacy.id, email),
  ]);
}
