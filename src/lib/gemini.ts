import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const geminiModel = "gemini-3-flash-preview";

export async function moderateContent(text: string) {
  const response = await ai.models.generateContent({
    model: geminiModel,
    contents: `Analyze the following social media post for toxicity, hate speech, harassment, or spam. 
    Return a JSON object with:
    - isSafe: boolean
    - reason: string (if not safe)
    - toxicityScore: number (0-1)
    
    Post: "${text}"`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          isSafe: { type: Type.BOOLEAN },
          reason: { type: Type.STRING },
          toxicityScore: { type: Type.NUMBER },
        },
        required: ["isSafe", "toxicityScore"],
      },
    },
  });

  return JSON.parse(response.text);
}

export async function translateContent(text: string, targetLanguage: "English" | "Chichewa") {
  const response = await ai.models.generateContent({
    model: geminiModel,
    contents: `Translate the following text to ${targetLanguage}. 
    If it's already in ${targetLanguage}, return it as is.
    
    Text: "${text}"`,
  });

  return response.text;
}

export async function generateCaption(topic: string) {
  const response = await ai.models.generateContent({
    model: geminiModel,
    contents: `Generate 3 catchy social media captions for a post about: "${topic}". 
    Keep them short, engaging, and relevant for a Malawian audience.
    Return as a JSON array of strings.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
    },
  });

  return JSON.parse(response.text);
}

export async function aiChatAssistant(message: string, history: { role: "user" | "model", parts: { text: string }[] }[]) {
  const chat = ai.chats.create({
    model: geminiModel,
    config: {
      systemInstruction: "You are Zathu AI, a helpful assistant for the Zathu social media platform. You help users with app features, local information in Malawi, and general questions. You speak both English and Chichewa fluently.",
    },
    history,
  });

  const response = await chat.sendMessage({ message });
  return response.text;
}

export async function generateMarketDescription(itemName: string, category: string) {
  const response = await ai.models.generateContent({
    model: geminiModel,
    contents: `Write a compelling and professional description for a marketplace item in Malawi.
    Item: ${itemName}
    Category: ${category}
    
    Include points about:
    - Quality and condition
    - Why it's a good deal
    - Mention it's available for inspection in Malawi
    
    Keep it under 300 characters. Return just the text.`,
  });

  return response.text;
}

export async function suggestMarketPrice(itemName: string, category: string) {
  const response = await ai.models.generateContent({
    model: geminiModel,
    contents: `Suggest a realistic price range in Malawi Kwacha (MWK) for the following item.
    Item: ${itemName}
    Category: ${category}
    
    Return a JSON object with:
    - minPrice: number
    - maxPrice: number
    - reason: string (brief explanation of Malawian market value)`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          minPrice: { type: Type.NUMBER },
          maxPrice: { type: Type.NUMBER },
          reason: { type: Type.STRING },
        },
        required: ["minPrice", "maxPrice", "reason"],
      },
    },
  });

  return JSON.parse(response.text);
}

export async function generateTags(description: string) {
  const response = await ai.models.generateContent({
    model: geminiModel,
    contents: `Analyze the following description and generate 5 relevant, SEO-friendly hashtags/tags for a Malawian social media audience. 
    Include both English and common Chichewa terms if applicable.
    
    Description: "${description}"
    
    Return as a JSON array of strings (no # symbols).`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
    },
  });

  return JSON.parse(response.text);
}

export async function generateSocialMediaContent(input: {
  topic: string;
  audience: string;
  platform: string;
  tone: string;
  language: string;
  goal: string;
  facts?: string;
}) {
  const response = await ai.models.generateContent({
    model: geminiModel,
    contents: `Create social media content that feels authentic, accurate, and human-written.

Brief:
- Topic: ${input.topic}
- Audience: ${input.audience}
- Platform: ${input.platform}
- Goal: ${input.goal}
- Tone: ${input.tone}
- Language: ${input.language}
- Verified facts to use exactly, without inventing unsupported details: ${input.facts || 'No extra facts provided'}

Rules:
- Do not invent prices, dates, locations, testimonials, guarantees, or statistics.
- Use a natural human rhythm, varied sentence lengths, and specific local context only when supplied.
- Avoid generic AI phrases like "unlock your potential" or "game changer" unless they genuinely fit.
- Include a clear call to action.
- Return JSON with post, hashtags, and hooks.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          post: { type: Type.STRING },
          hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
          hooks: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["post", "hashtags", "hooks"],
      },
    },
  });

  return JSON.parse(response.text);
}
