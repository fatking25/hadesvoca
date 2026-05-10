/**
 * localStorage 등 영구 저장소에 쓰는 키 문자열.
 * 값 본문의 schema version(`UserProgress.version`)과는 별개로, 키는 안정적으로 유지한다.
 */
export const STORAGE_KEY_USER_PROGRESS = 'hadesvoca:userProgress' as const
