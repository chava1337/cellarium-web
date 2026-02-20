/**
 * Configuración centralizada para APIs de vino
 */

export interface WineAPIConfig {
  name: string;
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  timeout: number;
  retries: number;
}

export const wineAPIs: Record<string, WineAPIConfig> = {
  openai: {
    name: 'OpenAI',
    enabled: !!process.env.EXPO_PUBLIC_OPENAI_API_KEY,
    apiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY || '',
    baseUrl: 'https://api.openai.com/v1',
    timeout: 30000,
    retries: 3
  },
  googleVision: {
    name: 'Google Vision',
    enabled: !!process.env.EXPO_PUBLIC_GOOGLE_VISION_API_KEY,
    apiKey: process.env.EXPO_PUBLIC_GOOGLE_VISION_API_KEY || '',
    baseUrl: 'https://vision.googleapis.com/v1',
    timeout: 20000,
    retries: 2
  }
};

export const getEnabledAPIs = (): WineAPIConfig[] => {
  return Object.values(wineAPIs).filter(api => api.enabled);
};

export const getAPINames = (): string[] => {
  return getEnabledAPIs().map(api => api.name);
};

export const isAPIEnabled = (apiName: string): boolean => {
  return wineAPIs[apiName]?.enabled || false;
};

export const getAPIConfig = (apiName: string): WineAPIConfig | null => {
  return wineAPIs[apiName] || null;
};
