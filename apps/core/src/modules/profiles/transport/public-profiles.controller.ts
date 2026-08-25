import { Controller, Get, Header, Param, ParseUUIDPipe, UseFilters } from '@nestjs/common';
import { ProfilesService } from '../application/profiles.service';
import { ProfilesExceptionFilter } from './profiles-exception.filter';

@Controller('public/profiles')
@UseFilters(ProfilesExceptionFilter)
export class PublicProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get(':publicId')
  @Header('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=60')
  getProfile(@Param('publicId', new ParseUUIDPipe({ version: '4' })) publicId: string) {
    return this.profiles.getPublicProfile(publicId);
  }
}
