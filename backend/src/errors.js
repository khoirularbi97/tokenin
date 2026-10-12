export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Membungkus handler async supaya error masuk ke error handler Express
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
