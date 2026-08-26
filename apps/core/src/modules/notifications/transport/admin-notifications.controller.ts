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
import { AdminAuthService } from '../../auth/application/admin-auth.service';
import { AuthError } from '../../auth/application/auth.error';
import { AdminBffGuard } from '../../auth/transport/admin-bff.guard';
import { NotificationsService } from '../application/notifications.service';
import { NotificationQueryDto } from './notifications.dto';
import { NotificationsExceptionFilter } from './notifications-exception.filter';

@Controller('internal/admin/notifications')
@UseFilters(NotificationsExceptionFilter)
@UseGuards(AdminBffGuard)
export class AdminNotificationsController {
  constructor(
    private readonly auth: AdminAuthService,
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
      audience: 'admin',
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
      audience: 'admin',
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
      audience: 'admin',
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
      audience: 'admin',
      notificationPublicId,
      now: new Date(),
    });
  }

  private authorize(authorization: string | undefined) {
    return this.auth.authorizeAdmin(requireSessionToken(authorization));
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
