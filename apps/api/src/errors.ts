import type { ApiErrorResponse } from "@i-remember/types";

export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly code = "unexpected",
  ) {
    super(message);
  }
}

export function errorBody(error: unknown): ApiErrorResponse {
  if (error instanceof ApiError) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
      },
    };
  }

  return {
    success: false,
    error: {
      code: "unexpected",
      message: "Unexpected server error",
    },
  };
}
