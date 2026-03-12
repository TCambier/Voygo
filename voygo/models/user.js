// Deprecated client-side model. Authentication now happens via /api/auth/* endpoints.
// This file remains to avoid breaking old imports but should not be used.
export class User {
  static async create() {
    throw new Error('User.create is deprecated. Use /api/auth/signup.');
  }
  static async emailExists() {
    throw new Error('User.emailExists is deprecated. Use /api/auth/email-exists.');
  }
  static async verifyPassword() {
    throw new Error('User.verifyPassword is deprecated. Use /api/auth/login.');
  }
}
