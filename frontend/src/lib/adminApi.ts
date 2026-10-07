/**
 * BEACON CHILE — Cliente mínimo para la API admin
 * ================================================
 * Agrega el Bearer del Overlord y convierte los errores HTTP en `Error` con el
 * `detail` del backend, para que las pantallas muestren un mensaje legible.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = typeof window === "undefined" ? "" : localStorage.getItem("beacon_token") || "";
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = typeof body?.detail === "string" ? body.detail : `Error ${res.status}`;
    throw new Error(detail);
  }
  return (await res.json()) as T;
}
