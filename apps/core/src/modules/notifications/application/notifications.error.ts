export class NotificationsError extends Error {
  constructor(
    readonly code: 'INVALID_NOTIFICATION_CURSOR' | 'NOTIFICATION_NOT_FOUND',
    readonly status: 404 | 422,
  ) {
    super(code);
    this.name = 'NotificationsError';
  }
}
