import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  COLLECTION_FIELD_TYPES,
  COLLECTION_FILE_TYPES,
  MAX_FIELDS_PER_FORM,
  MAX_FILES_PER_FIELD,
  MAX_OPTIONS_PER_FIELD,
} from '../application/collection-field';
import { MAX_MATRIX_ROWS } from '../application/collection-matrix';
import { MAX_NOTIFICATION_FEED } from '../application/collection-notifications';
import type {
  CollectionAnswers,
  CollectionFieldType,
  CollectionFileType,
} from '../application/collection-forms.ports';

export class CollectionFileFieldConfigDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(COLLECTION_FILE_TYPES.length)
  @IsIn(COLLECTION_FILE_TYPES, { each: true })
  allowedFileTypes!: CollectionFileType[];

  @IsInt()
  @Min(1)
  @Max(MAX_FILES_PER_FIELD)
  maxFiles!: number;
}

export class CollectionFieldDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{1,64}$/)
  id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label!: string;

  @IsString()
  @MaxLength(1_000)
  description!: string;

  @IsBoolean()
  required!: boolean;

  @IsIn(COLLECTION_FIELD_TYPES)
  type!: CollectionFieldType;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_OPTIONS_PER_FIELD)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  options?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CollectionFileFieldConfigDto)
  file?: CollectionFileFieldConfigDto;

  /*
   * The Instructor selects this explicitly. It is deliberately not derived from
   * the label, so two similarly worded questions never share values by accident.
   */
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9_-]{0,62}[a-z0-9]$/)
  mappingKey?: string;
}

class CollectionFormBodyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(5_000)
  description!: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  deadlineAt!: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_FIELDS_PER_FORM)
  @ValidateNested({ each: true })
  @Type(() => CollectionFieldDto)
  fields!: CollectionFieldDto[];
}

export class CreateCollectionFormDto extends CollectionFormBodyDto {}

export class UpdateCollectionFormDto extends CollectionFormBodyDto {}

/** The subset of metadata that stays editable after a form is opened. */
export class UpdateCollectionFormMetadataDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(5_000)
  description!: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  deadlineAt!: string | null;
}

export class CreateCollectionTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(5_000)
  description!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_FIELDS_PER_FORM)
  @ValidateNested({ each: true })
  @Type(() => CollectionFieldDto)
  fields!: CollectionFieldDto[];
}

export class UpdateCollectionTemplateDto extends CreateCollectionTemplateDto {}

/** Saves an existing form's current definition as a reusable template. */
export class SaveFormAsTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}

export class CreateFormFromTemplateDto {
  @IsUUID('4')
  templateId!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;
}

export class SaveCollectionDraftDto {
  @IsObject()
  answers!: CollectionAnswers;

  @IsInt()
  @Min(0)
  expectedVersion!: number;
}

export class CheckCollectionSubmissionDto {
  @IsIn(['passed', 'changes_required'])
  decision!: 'changes_required' | 'passed';

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  reason!: string | null;
}

export class SubmitCollectionFormDto {
  @IsUUID('4')
  idempotencyKey!: string;
}

/**
 * Declares an upload before any bytes are sent. Everything here is a claim by the
 * browser: it is checked for plausibility now and against the stored file later.
 */
export class CreateCollectionUploadDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{1,64}$/)
  fieldId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  filename!: string;

  @IsString()
  @MaxLength(255)
  declaredContentType!: string;

  @IsInt()
  @Min(1)
  byteSize!: number;
}

export class AttachCollectionFileDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{1,64}$/)
  fieldId!: string;

  @IsUUID('4')
  fileId!: string;
}

/**
 * Closing or reopening a form or a round.
 *
 * The reason is required at the boundary as well as in the domain: the audit
 * trail is the only record of why first submissions stopped, and an empty
 * string is not an explanation.
 */
export class CollectionLifecycleReasonDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2_000)
  reason!: string;
}

/**
 * One page of the group matrix.
 *
 * The cursor is the account id of the last row already shown, which is opaque
 * to the reader and safe in a URL -- unlike a Student ID, which never appears
 * in one.
 */
export class CollectionMatrixQueryDto {
  @IsOptional()
  @IsUUID('4')
  after?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_MATRIX_ROWS)
  limit?: number;
}

/**
 * Notifications the Student has seen.
 *
 * The ids are only a scoping hint: the update is keyed by the caller's own
 * account id in the query, so an id belonging to someone else marks nothing.
 */
export class MarkNotificationsReadDto {
  @IsArray()
  @ArrayMaxSize(MAX_NOTIFICATION_FEED)
  @IsUUID('4', { each: true })
  notificationIds!: string[];
}
