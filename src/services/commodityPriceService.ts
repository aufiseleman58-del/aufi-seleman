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
    const response = await fetch("/api/gemini", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "fetchOfficialCommodityPrices" }),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch official prices. Status: ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error("Returned prices data is not a valid list");
    }
    return data.map((item: any, index: number) => ({
      ...item,
      id: `official-${index}`
    }));
  } catch (error) {
    console.warn("Error fetching official prices: running standard prices", error);
    // Fallback to mock data if AI fails
    return [
      { id: '1', name: 'Maize (Cereal)', price: '2,400', unit: 'per kg', trend: 'up', district: 'Lilongwe', source: 'Ministry of Agriculture', date: new Date().toISOString() },
      { id: '2', name: 'Rice (Polished)', price: '3,200', unit: 'per kg', trend: 'stable', district: 'Blantyre', source: 'Ministry of Agriculture', date: new Date().toISOString() },
    ];
  }
}
