export const geminiModel = "gemini-3.5-flash"; 

async function callGeminiApi<T>(action: string, args: Record<string, any>): Promise<T> {
  const response = await fetch("/api/gemini", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, ...args }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to run Gemini action "${action}". Status: ${response.status}`);
  }

  return response.json();
}

export async function moderateContent(text: string) {
  return callGeminiApi<any>("moderateContent", { text });
}

export async function translateContent(text: string, targetLanguage: "English" | "Chichewa") {
  const result = await callGeminiApi<{ text: string }>("translateContent", { text, targetLanguage });
  return result.text;
}

export async function generateCaption(topic: string) {
  return callGeminiApi<string[]>("generateCaption", { topic });
}

export async function aiChatAssistant(message: string, history: { role: "user" | "model", parts: { text: string }[] }[]) {
  const result = await callGeminiApi<{ text: string }>("aiChatAssistant", { message, history });
  return result.text;
}

export async function generateMarketDescription(itemName: string, category: string) {
  const result = await callGeminiApi<{ text: string }>("generateMarketDescription", { itemName, category });
  return result.text;
}

export async function suggestMarketPrice(itemName: string, category: string) {
  return callGeminiApi<any>("suggestMarketPrice", { itemName, category });
}

export async function generateTags(description: string) {
  return callGeminiApi<string[]>("generateTags", { description });
}

export async function generateImageFromPrompt(prompt: string): Promise<string> {
  const result = await callGeminiApi<{ imageUrl: string }>("generateImageFromPrompt", { prompt });
  return result.imageUrl;
}

export async function generateImageWithSourceImage(prompt: string, sourceImageBase64: string): Promise<string> {
  const result = await callGeminiApi<{ imageUrl: string }>("generateImageWithSourceImage", { prompt, sourceImageBase64 });
  return result.imageUrl;
}

export async function rankContent(userMetadata: any, items: any[]) {
  return callGeminiApi<any>("rankContent", { userMetadata, items });
}

export async function getWalletInsights(transactions: any[], balance: number) {
  return callGeminiApi<any>("getWalletInsights", { transactions, balance });
}

export async function getSystemHealthReport(stats: any, logs: string[]) {
  return callGeminiApi<any>("getSystemHealthReport", { stats, logs });
}
