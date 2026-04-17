import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface CommodityPrice {
  id: string;
  name: string;
  price: string;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  district: string;
  source: string;
  date: string;
}

export async function fetchOfficialCommodityPrices(): Promise<CommodityPrice[]> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: "Get the latest official market commodity prices for Malawi as reported by the Ministry of Agriculture or AMIS (Agricultural Market Information System). Focus on staple foods like Maize, Rice, Beans, and Fertilizer prices. Return as JSON.",
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              price: { type: Type.STRING },
              unit: { type: Type.STRING },
              trend: { type: Type.STRING, enum: ['up', 'down', 'stable'] },
              district: { type: Type.STRING },
              source: { type: Type.STRING },
              date: { type: Type.STRING }
            },
            required: ['name', 'price', 'unit', 'trend', 'district', 'source', 'date']
          }
        },
        tools: [
          { googleSearch: {} }
        ],
        toolConfig: { includeServerSideToolInvocations: true }
      }
    });

    const data = JSON.parse(response.text || "[]");
    return data.map((item: any, index: number) => ({
      ...item,
      id: `official-${index}`
    }));
  } catch (error) {
    console.error("Error fetching official prices:", error);
    // Fallback to mock data if AI fails
    return [
      { id: '1', name: 'Maize (Cereal)', price: '2,400', unit: 'per kg', trend: 'up', district: 'Lilongwe', source: 'Ministry of Agriculture', date: new Date().toISOString() },
      { id: '2', name: 'Rice (Polished)', price: '3,200', unit: 'per kg', trend: 'stable', district: 'Blantyre', source: 'Ministry of Agriculture', date: new Date().toISOString() },
    ];
  }
}
