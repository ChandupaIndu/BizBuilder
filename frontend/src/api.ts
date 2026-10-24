const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
export type User = { id: string; name: string; email: string };
export type Business = { id: string; name: string; description?: string; category?: string; website?: Website[]; _count?: { products: number } };
export type Website = { id: string; name: string; slug: string; status: 'DRAFT' | 'PUBLISHED'; template: string; pages?: Page[] };
export type Page = { id: string; title: string; slug: string; content: string };
export type Product = { id: string; name: string; description?: string; price?: string | number; type: string };

export async function request<T>(path: string, token?: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
    });
  } catch {
    throw new Error(`Cannot reach the BizBuilder API at ${API_URL}. Start the backend and check VITE_API_URL and CORS_ORIGINS.`);
  }
  let payload: { success?: boolean; data?: T; error?: { code?: string; message?: string } };
  try { payload = await response.json() as typeof payload; }
  catch { throw new Error(`The BizBuilder API returned an unreadable response (HTTP ${response.status}).`); }
  if (!response.ok || !payload.success) throw new Error(payload.error?.message || `Request failed (HTTP ${response.status})`);
  return payload.data as T;
}
