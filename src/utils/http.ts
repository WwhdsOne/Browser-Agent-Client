import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { getBaseURL, getTimeout } from '@/config/api.config'

const createAxiosInstance = (): AxiosInstance => {
  const instance = axios.create({
    baseURL: getBaseURL(),
    timeout: getTimeout(),
    headers: {
      'Content-Type': 'application/json'
    }
  })

  instance.interceptors.request.use(
    (config) => {
      const token = sessionStorage.getItem('token')
      if (token) {
        config.headers.authorization = token
      }
      return config
    },
    (error) => {
      return Promise.reject(error)
    }
  )

  instance.interceptors.response.use(
    (response: AxiosResponse) => {
      return response
    },
    (error) => {
      if (error.response?.status === 401) {
        sessionStorage.removeItem('token')
        window.location.href = '/#/login'
      }
      return Promise.reject(error)
    }
  )

  return instance
}

const http: AxiosInstance = createAxiosInstance()

export const get = <T>(url: string, config?: AxiosRequestConfig): Promise<T> => {
  return http.get(url, config).then((res) => res.data)
}

export const post = <T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> => {
  return http.post(url, data, config).then((res) => res.data)
}

export const del = <T>(url: string, config?: AxiosRequestConfig): Promise<T> => {
  return http.delete(url, config).then((res) => res.data)
}

export default http
