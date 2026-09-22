import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { CollectionFormsError } from '../application/collection-forms.ports';

@Catch(CollectionFormsError)
export class CollectionFormsExceptionFilter implements ExceptionFilter {
  catch(error: CollectionFormsError, host: ArgumentsHost): void {
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(error.status)
      .json({ errorCode: error.code });
  }
}
