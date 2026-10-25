export type AccountIdentity = {
  id: string
  email: string | null
}

export type TokenVerifier = (accessToken: string) => Promise<AccountIdentity>
