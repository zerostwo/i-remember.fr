export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly code = "unexpected",
  ) {
    super(message);
  }
}

export function errorBody(error: unknown) {
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
