// Thin client for the Bitwix backend API.
// The base URL comes from VITE_API_URL (see Frontend/.env), defaulting to the
// local backend so the app works out of the box in development.
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export interface ContactPayload {
  name: string;
  email: string;
  phone?: string;
  subject?: string;
  message: string;
}

export interface ApiResult<T = unknown> {
  success: boolean;
  message?: string;
  errors?: Record<string, string>;
  data?: T;
  id?: number;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<ApiResult<T>> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  let body: ApiResult<T>;
  try {
    body = await res.json();
  } catch {
    body = { success: false, message: "Unexpected server response." };
  }

  if (!res.ok) {
    // Surface the server-provided message where available.
    return { ...body, success: false };
  }
  return body;
}

export function submitContact(payload: ContactPayload) {
  return request("/contact", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
