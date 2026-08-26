import { Controller, Get, Header, Param, ParseUUIDPipe, Res, UseFilters } from '@nestjs/common';
import type { Response } from 'express';
import { ProfilesService } from '../application/profiles.service';
import { ProfilesExceptionFilter } from './profiles-exception.filter';

@Controller('public/profiles')
@UseFilters(ProfilesExceptionFilter)
export class PublicProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get(':publicId')
  @Header('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=60')
  getProfile(
    @Param('publicId', new ParseUUIDPipe({ version: '4' })) publicId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Tag', `showcase-catalog,showcase-profile-${publicId}`);
    return this.profiles.getPublicProfile(publicId);
  }
}
