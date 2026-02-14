export interface ApiConfig {
  baseURL: string
  timeout: number
  wsBaseURL: string
}

const config: ApiConfig = {
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: Number(import.meta.env.VITE_API_TIMEOUT) || 30000,
  wsBaseURL: (import.meta.env.VITE_BACKEND_URL || 'http://localhost:8888').replace(/^http/, 'ws')
}

export const getBaseURL = (): string => config.baseURL
export const getTimeout = (): number => config.timeout

export const getWSBaseURL = (): string => {
  return config.wsBaseURL
}

export const setBaseURL = (url: string): void => {
  config.baseURL = url
}
