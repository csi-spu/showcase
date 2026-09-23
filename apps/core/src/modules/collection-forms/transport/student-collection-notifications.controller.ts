import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AuthError } from '../../auth/application/auth.error';
import { StudentCollectionAuthService } from '../../auth/application/student-collection-auth.service';
import { StudentCollectionBffGuard } from '../../auth/transport/student-collection-bff.guard';
import { CollectionFormsService } from '../application/collection-forms.service';
import { MarkNotificationsReadDto } from './collection-forms.dto';
import { CollectionFormsExceptionFilter } from './collection-forms-exception.filter';
import { toNotificationView } from './collection-forms.view';

/**
 * A Student's own collection notifications.
 *
 * Separate from the forms controller because a notification is not scoped to
 * one form: the feed spans every group the Student belongs to.
 */
@Controller('internal/student-collection/notifications')
@UseFilters(CollectionFormsExceptionFilter)
@UseGuards(StudentCollectionBffGuard)
export class StudentCollectionNotificationsController {
  constructor(
    private readonly auth: StudentCollectionAuthService,
    private readonly forms: CollectionFormsService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async list(@Headers('authorization') authorization: string | undefined) {
    const actor = await this.auth.authorizeRead(token(authorization));
    const feed = await this.forms.readNotificationFeed(actor.accountId);
    return {
      notifications: feed.notifications.map(toNotificationView),
      unreadCount: feed.unreadCount,
    };
  }

  @Post('read')
  @Header('Cache-Control', 'no-store')
  async markRead(
    @Body() body: MarkNotificationsReadDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const actor = await this.auth.authorizeMutation(token(authorization));
    return this.forms.markNotificationsRead({
      notificationIds: body.notificationIds,
      studentAccountId: actor.accountId,
    });
  }
}

function token(authorization: string | undefined): string {
  const value = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (value.length === 0 || value.length > 512) throw new AuthError('UNAUTHENTICATED', 401);
  return value;
}
