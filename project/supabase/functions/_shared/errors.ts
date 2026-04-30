import { jsonResponse } from "./cors.ts";

export class HttpError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.details = details;
  }
}

export function safeErrorMessage(error: unknown) {
  if (error instanceof HttpError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected error";
}

export function handleError(error: unknown) {
  if (error instanceof HttpError) {
    return jsonResponse(
      {
        error: error.message,
        details: error.details,
      },
      error.status,
    );
  }

  console.error("[edge-function] unexpected error", error);

  return jsonResponse(
    {
      error: "Internal server error",
    },
    500,
  );
}
