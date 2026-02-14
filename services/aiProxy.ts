export async function aiChat(prompt: string, system?: string) {
  const r = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, system })
  });

  const data = await r.json().catch(async () => {
    const text = await r.text().catch(() => "");
    throw new Error(`Non-JSON response (${r.status}): ${text.slice(0, 200)}`);
  });

  if (!data.ok) {
    const e = new Error(data.message || "AI Error");
    (e as any).code = data.error_code;
    (e as any).retryable = data.retryable;
    throw e;
  }

  return data.data.text as string;
}
