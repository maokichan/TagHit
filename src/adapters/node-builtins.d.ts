declare module 'node:crypto' {
  export interface Hash {
    update(data: Uint8Array): Hash
    digest(encoding?: string): string
  }

  export function createHash(algorithm: string): Hash
}
