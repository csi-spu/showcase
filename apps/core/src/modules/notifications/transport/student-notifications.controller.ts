import {
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AuthError } from '../../auth/application/auth.error';
import { StudentAuthService } from '../../auth/application/student-auth.service';
import { StudentBffGuard } from '../../auth/transport/student-bff.guard';
import { NotificationsService } from '../application/notifications.service';
import { NotificationQueryDto } from './notifications.dto';
import { NotificationsExceptionFilter } from './notifications-exception.filter';

@Controller('internal/student/notifications')
@UseFilters(NotificationsExceptionFilter)
@UseGuards(StudentBffGuard)
export class StudentNotificationsController {
  constructor(
    private readonly auth: StudentAuthService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  async list(
    @Query() query: NotificationQueryDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.authorize(authorization);
    return this.notifications.list({
      accountId: actor.accountId,
      audience: 'student',
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      limit: query.limit,
      now: new Date(),
      view: query.view,
    });
  }

  @Get('unread-count')
  @Header('Cache-Control', 'private, no-store')
  async unreadCount(@Headers('authorization') authorization: string | undefined) {
    const actor = await this.authorize(authorization);
    return this.notifications.countUnread({
      accountId: actor.accountId,
      audience: 'student',
      now: new Date(),
    });
  }

  @Post('read-all')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  async markAllRead(@Headers('authorization') authorization: string | undefined) {
    const actor = await this.authorize(authorization);
    return this.notifications.markAllRead({
      accountId: actor.accountId,
      audience: 'student',
      now: new Date(),
    });
  }

  @Post(':publicId/read')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  async markRead(
    @Param('publicId', new ParseUUIDPipe({ version: '4' })) notificationPublicId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.authorize(authorization);
    return this.notifications.markRead({
      accountId: actor.accountId,
      audience: 'student',
      notificationPublicId,
      now: new Date(),
    });
  }

  private async authorize(authorization: string | undefined) {
    return this.auth.authorizeStudentRead(requireSessionToken(authorization));
  }
}

function requireSessionToken(authorization: string | undefined): string {
  const prefix = 'Bearer ';
  const sessionToken = authorization?.startsWith(prefix)
    ? authorization.slice(prefix.length).trim()
    : '';
  if (sessionToken.length === 0 || sessionToken.length > 512) {
    throw new AuthError('UNAUTHENTICATED', 401);
  }
  return sessionToken;
}
