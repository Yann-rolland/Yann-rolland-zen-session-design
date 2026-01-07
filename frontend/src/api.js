// API base:
// - en prod / tunnel: on veut le même host que la page (sinon "localhost" pointerait vers le PC du client)
// - en dev: VITE_API_BASE peut override
// - fallback final: 127.0.0.1:8006 (PC dev)
const API_BASE =
  import.meta.env.VITE_API_BASE ||
  (typeof window !== "undefined" ? window.location.origin : "") ||
  "http://127.0.0.1:8006";

export async function generateSession(payload) {
  const res = await fetch(`${API_BASE}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || "Erreur API");
  }
  return res.json();
}

export async function listRuns(limit = 50) {
  const res = await fetch(`${API_BASE}/runs?limit=${encodeURIComponent(limit)}`);
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || "Erreur API (runs)");
  }
  return res.json();
}

export async function getRun(runId) {
  const res = await fetch(`${API_BASE}/runs/${encodeURIComponent(runId)}`);
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || "Erreur API (run)");
  }
  return res.json();
}

export async function deleteRun(runId) {
  const res = await fetch(`${API_BASE}/runs/${encodeURIComponent(runId)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || "Erreur API (delete run)");
  }
  return res.json();
}

