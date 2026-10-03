import { publicSourceUrl, validatePublicSourceResult, type PublicSourceResult } from '../../worker/public-source-protocol.mjs'

/** Ephemeral read capability: observed changes permanently detach even after A → B → A. */
export class PublicSourceReadSession {
  private active = true
  constructor(private readonly scope: string, readonly url: string) { publicSourceUrl(url) }
  observe(scope: string) { if (scope !== this.scope) this.detach() }
  detach() { this.active = false }
  get current() { return this.active }
  async load(read: () => Promise<PublicSourceResult>, publish: (result: PublicSourceResult) => void, fail: (cause: unknown) => void) {
    try { const result = validatePublicSourceResult(await read(), { url: this.url }); if (this.active) publish(result) }
    catch (cause) { if (this.active) fail(cause) }
  }
}
