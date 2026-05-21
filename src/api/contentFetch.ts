import { ContentFetchError } from './contentApi'

const CONTENT_OFFLINE_MESSAGE =
  '콘텐츠를 불러오지 못했습니다. 오프라인 상태라면 한 번 온라인으로 접속해 콘텐츠를 캐시한 뒤 다시 시도해 주세요.'

export async function fetchContentText(url: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(url)
  } catch (cause) {
    throw new ContentFetchError(CONTENT_OFFLINE_MESSAGE, url, cause)
  }
  if (!res.ok) {
    throw new ContentFetchError(`${CONTENT_OFFLINE_MESSAGE} (HTTP ${res.status})`, url)
  }
  return res.text()
}

export function parseContentJson(url: string, text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch (cause) {
    throw new ContentFetchError('JSON 형식이 올바르지 않습니다.', url, cause)
  }
}
