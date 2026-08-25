import {
  Controller,
  Get,
  Header,
  Headers,
  Param,
  ParseUUIDPipe,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AuthError } from '../../auth/application/auth.error';
import { StudentAuthService } from '../../auth/application/student-auth.service';
import { StudentBffGuard } from '../../auth/transport/student-bff.guard';
import { ReviewsService } from '../application/reviews.service';
import { WorksExceptionFilter } from './works-exception.filter';

@Controller('internal/student/works/:workPublicId')
@UseFilters(WorksExceptionFilter)
@UseGuards(StudentBffGuard)
export class StudentReviewsController {
  constructor(
    private readonly auth: StudentAuthService,
    private readonly reviews: ReviewsService,
  ) {}

  @Get('change-request')
  @Header('Cache-Control', 'no-store')
  async getLatestChangeRequest(
    @Param('workPublicId', new ParseUUIDPipe({ version: '4' })) workPublicId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeStudentRead(this.requireSessionToken(authorization));
    return {
      review: await this.reviews.getLatestChangeRequest(actor.accountId, workPublicId),
    };
  }

  private requireSessionToken(authorization: string | undefined): string {
    const prefix = 'Bearer ';
    const token = authorization?.startsWith(prefix)
      ? authorization.slice(prefix.length).trim()
      : '';
    if (token.length === 0 || token.length > 512) {
      throw new AuthError('UNAUTHENTICATED', 401);
    }
    return token;
  }
}
