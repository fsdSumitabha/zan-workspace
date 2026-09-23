/**
 * A refused request. Every route turns it into `error.statusCode`.
 *
 * Lives in its own file so low-level code, such as regionScopePlugin, can
 * throw it without importing requireAuth. requireAuth imports region-scope,
 * so importing it back from there would be a circular import.
 */
export class AuthError extends Error {
    statusCode: number

    constructor(message: string, statusCode: number = 401) {
        super(message)
        this.statusCode = statusCode

        // fix prototype chain (important in TS)
        Object.setPrototypeOf(this, AuthError.prototype)
    }
}
