/** An error whose message is safe and intended to be shown to the user. */
export class ApiError extends Error {
  constructor(
    public readonly userMessage: string,
    public readonly status?: number,
  ) {
    super(userMessage);
  }
}
