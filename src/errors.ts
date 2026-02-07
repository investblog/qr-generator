function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export function badRequest(message: string): Response {
  return errorResponse(400, message);
}

export function payloadTooLarge(message: string): Response {
  return errorResponse(413, message);
}

export function notFound(): Response {
  return errorResponse(404, 'Not found');
}

export function internalError(message: string): Response {
  return errorResponse(500, message);
}
