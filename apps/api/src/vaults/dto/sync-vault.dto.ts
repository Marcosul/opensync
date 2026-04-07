import { IsObject } from 'class-validator';

export class SyncVaultDto {
  @IsObject()
  files!: Record<string, string>;
}
