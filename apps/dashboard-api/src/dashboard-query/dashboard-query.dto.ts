import { IsIn, IsOptional } from 'class-validator';

export class BacklogExportQueryDto {
  @IsOptional()
  @IsIn(['json', 'md'])
  format?: 'json' | 'md';
}
