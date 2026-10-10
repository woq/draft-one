import axios, { AxiosRequestConfig, AxiosResponse } from 'axios'
import { LogManager } from './log-manager'

/**
 * NetClient: Intelligent HTTP client for application outgoing requests.
 * Priority 1: Proxy through local Mihomo mixed-port (127.0.0.1:mixedPort)
 * Priority 2: Automatic fallback to DIRECT connection if proxy fails or is offline
 */
export class NetClient {
  public static defaultPort = 7890

  /**
   * Executes an HTTP request with dual-channel (Proxy -> Direct fallback) strategy.
   *
   * @param config Standard AxiosRequestConfig
   * @param mixedPort Optional Mihomo mixed port (default 7890)
   * @returns AxiosResponse
   */
  public static async request<T = unknown>(
    config: AxiosRequestConfig,
    mixedPort?: number
  ): Promise<AxiosResponse<T>> {
    const port = mixedPort || this.defaultPort
    const targetUrl = config.url || ''
    const fresh = (proxy: AxiosRequestConfig['proxy']): AxiosRequestConfig => ({
      url: config.url,
      method: config.method || 'GET',
      data: config.data,
      params: config.params,
      responseType: config.responseType,
      timeout: config.timeout || 15000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'draft-one',
        ...(config.headers as Record<string, string> | undefined)
      },
      proxy
    })

    // 1. Channel 1: Attempt via local proxy
    try {
      const res = await axios(fresh({ host: '127.0.0.1', port, protocol: 'http' }))
      return res
    } catch (proxyErr: unknown) {
      const errMsg = proxyErr instanceof Error ? proxyErr.message : String(proxyErr)
      LogManager.pushRaw(
        `[NetClient] 优先代理请求异常 (${targetUrl}) [${errMsg}]，正在自动切换为直连 (DIRECT)...`,
        false
      )

      // 2. Channel 2: Fallback to DIRECT. New config object, so a failed proxy attempt cannot cancel it.
      try {
        const directRes = await axios(fresh(false))
        LogManager.pushRaw(
          `[NetClient] 直连备选重试成功 (${targetUrl})`,
          false
        )
        return directRes
      } catch (directErr: unknown) {
        const directErrMsg = directErr instanceof Error ? directErr.message : String(directErr)
        LogManager.pushRaw(
          `[NetClient] 代理与直连双重尝试均失败 (${targetUrl}): 代理=[${errMsg}], 直连=[${directErrMsg}]`,
          true
        )
        throw new Error(
          `网络请求失败（代理尝试: ${errMsg}；直连重试: ${directErrMsg}）`
        )
      }
    }
  }

  public static async get<T = unknown>(
    url: string,
    config: AxiosRequestConfig = {},
    mixedPort?: number
  ): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'GET', url }, mixedPort)
  }
}
