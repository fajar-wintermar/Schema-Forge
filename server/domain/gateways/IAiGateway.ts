export interface IAiSchemaGateway {
  isConfigured(): boolean;
  generateSchemaSuggestion?(prompt: string): Promise<string>;
}
