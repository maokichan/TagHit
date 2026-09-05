/** 应用层写入路径抛出的领域错误。 */
export type DomainErrorCode = 'NOT_FOUND' | 'CONFLICT' | 'INVALID'

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'DomainError'
  }
}
