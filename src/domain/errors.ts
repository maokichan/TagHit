/** 应用层写入路径抛出的领域错误。 */
export type DomainErrorCode = 'NOT_FOUND' | 'CONFLICT' | 'INVALID'

export class DomainError extends Error {
  readonly code: DomainErrorCode

  constructor(code: DomainErrorCode, message: string) {
    super(message)
    this.name = 'DomainError'
    this.code = code
  }
}
