import { IsOptional, IsString, IsUUID } from 'class-validator';

export class AcceptInviteDto {
  @IsOptional()
  @IsString()
  token?: string;

  @IsOptional()
  @IsUUID()
  inviteId?: string;
}
