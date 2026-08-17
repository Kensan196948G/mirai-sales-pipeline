/** アプリケーションエラー */
export class AppError extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code = 'APP_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const Errors = {
  badRequest: (msg = 'リクエストが不正です') => new AppError(400, msg, 'BAD_REQUEST'),
  unauthorized: (msg = 'ログインが必要です') => new AppError(401, msg, 'UNAUTHORIZED'),
  forbidden: (msg = '権限がありません') => new AppError(403, msg, 'FORBIDDEN'),
  notFound: (msg = '対象が見つかりません') => new AppError(404, msg, 'NOT_FOUND'),
  conflict: (msg = '競合が発生しました') => new AppError(409, msg, 'CONFLICT'),
  tooMany: (msg = 'リクエストが多すぎます') => new AppError(429, msg, 'RATE_LIMITED'),
  internal: (msg = 'サーバー内部でエラーが発生しました') => new AppError(500, msg, 'INTERNAL'),
};
