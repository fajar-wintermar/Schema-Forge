import type { IAiSchemaGateway } from '../../domain/gateways/IAiGateway';

export class GeminiAiGateway implements IAiSchemaGateway {
  constructor(private readonly apiKey?: string) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }
}
