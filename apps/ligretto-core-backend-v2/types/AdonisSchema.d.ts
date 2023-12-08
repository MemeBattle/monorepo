/**
 * AdonisSchema
 * A AdonisSchema
 */
declare interface AdonisSchema {
    id?: number;
    batch: number;
    migrationTime?: string | null;
    name: string;
}
export { AdonisSchema };
