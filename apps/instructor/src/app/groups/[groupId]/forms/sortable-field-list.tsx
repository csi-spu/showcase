'use client';

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type Collision,
  type CollisionDetection,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVerticalIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useRef } from 'react';
import { buttonVariants } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { CollectionFormsErrorMessage, DraftField } from '@/app/collection-forms-state';
import { FieldEditor } from './field-editor';

/*
 * Questions differ a lot in height: an expanded one holds its whole editor.
 * Comparing centres or corners lets a tall question's own slot win over a short
 * neighbour, so an expanded question could not be moved past a collapsed one.
 * dnd-kit's keyboard coordinates align the moved card's top edge with the
 * question above, or its bottom edge with the one below, so matching the nearer
 * of those edges makes that neighbour the target. A pointer drag swaps once the
 * card's edge is nearer its neighbour's edge than its own slot's.
 */
const closestEdge: CollisionDetection = ({ collisionRect, droppableContainers, droppableRects }) =>
  droppableContainers
    .flatMap((droppableContainer) => {
      const rect = droppableRects.get(droppableContainer.id);
      if (rect === undefined) return [];
      const distance = Math.min(
        Math.abs(rect.top - collisionRect.top),
        Math.abs(rect.bottom - collisionRect.bottom),
      );
      return [{ distance, droppableContainer }];
    })
    .sort((left, right) => left.distance - right.distance)
    .map(({ distance, droppableContainer }): Collision => ({
      data: { droppableContainer, value: distance },
      id: droppableContainer.id,
    }));

interface SortableFieldListProps {
  activeFieldId: string | null;
  clientError: { fieldId: string; message: CollectionFormsErrorMessage } | null;
  fields: DraftField[];
  onChange: (id: string, patch: Partial<DraftField>) => void;
  onRemove: (id: string) => void;
  /** Called only when a drop actually moves a question to another position. */
  onReorder: (activeId: string, overId: string) => void;
  onToggle: (id: string) => void;
}

/**
 * The builder's question list, reordered by dragging a handle.
 *
 * The keyboard path is the same interaction: Space lifts a question, the arrow
 * keys move it, Space drops it, and Escape puts it back. Every step is
 * announced in Thai, so the order is never changed silently.
 */
export function SortableFieldList({
  activeFieldId,
  clientError,
  fields,
  onChange,
  onRemove,
  onReorder,
  onToggle,
}: SortableFieldListProps) {
  const t = useTranslations('Forms');
  const contextId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor),
    /*
     * An instant scroll rather than the default smooth one, so a keyboard move
     * never animates the page for someone who asked for reduced motion.
     */
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      scrollBehavior: 'auto',
    }),
  );

  function describe(id: UniqueIdentifier, positionId: UniqueIdentifier = id) {
    const field = fields.find((candidate) => candidate.id === id);
    return {
      label: field?.label.trim() || t('preview.untitledField'),
      position: fields.findIndex((candidate) => candidate.id === positionId) + 1,
      total: fields.length,
    };
  }

  /*
   * A lift is immediately followed by the question being "over" its own slot.
   * Announcing that would replace the pick-up message before a screen reader
   * reads it, so a move is announced only when the slot actually changes.
   */
  const announcedOverId = useRef<UniqueIdentifier | null>(null);

  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      announcedOverId.current = active.id;
      return t('builder.reorder.picked', describe(active.id));
    },
    onDragOver: ({ active, over }) => {
      if (over === null || over.id === announcedOverId.current) return undefined;
      announcedOverId.current = over.id;
      return t('builder.reorder.moved', describe(active.id, over.id));
    },
    onDragEnd: ({ active, over }) =>
      over === null
        ? t('builder.reorder.cancelled', describe(active.id))
        : t('builder.reorder.dropped', describe(active.id, over.id)),
    onDragCancel: ({ active }) => t('builder.reorder.cancelled', describe(active.id)),
  };

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (over === null || active.id === over.id) return;
    onReorder(String(active.id), String(over.id));
  }

  return (
    <DndContext
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: t('builder.reorder.instructions') },
      }}
      collisionDetection={closestEdge}
      id={contextId}
      onDragEnd={handleDragEnd}
      sensors={sensors}
    >
      <SortableContext
        items={fields.map((field) => field.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="flex list-none flex-col gap-3 p-0">
          {fields.map((field, index) => (
            <SortableFieldEditor
              errorMessage={clientError?.fieldId === field.id ? clientError.message : null}
              field={field}
              index={index}
              isExpanded={activeFieldId === field.id}
              key={field.id}
              onChange={onChange}
              onRemove={onRemove}
              onToggle={onToggle}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableFieldEditor({
  errorMessage,
  field,
  index,
  isExpanded,
  onChange,
  onRemove,
  onToggle,
}: {
  errorMessage: CollectionFormsErrorMessage | null;
  field: DraftField;
  index: number;
  isExpanded: boolean;
  onChange: (id: string, patch: Partial<DraftField>) => void;
  onRemove: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const t = useTranslations('Forms');
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    attributes: { roleDescription: t('builder.reorder.roleDescription') },
    id: field.id,
  });

  return (
    <FieldEditor
      dragHandle={
        /*
         * Focusing the handle opens its tooltip, and an open tooltip consumes
         * Escape to close itself. Disabling it while a question is lifted keeps
         * Escape free to cancel the move and keeps the hint off the moving card.
         */
        <Tooltip disabled={isDragging}>
          <TooltipTrigger
            {...attributes}
            {...listeners}
            aria-label={t('builder.dragHandleLabel', {
              label: field.label.trim() || String(index + 1),
            })}
            className={cn(
              buttonVariants({ size: 'icon-sm', variant: 'ghost' }),
              'cursor-grab touch-none text-muted-foreground active:cursor-grabbing',
            )}
            ref={setActivatorNodeRef}
            type="button"
          >
            <GripVerticalIcon aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent>{t('builder.dragHandle')}</TooltipContent>
        </Tooltip>
      }
      errorMessage={errorMessage}
      field={field}
      index={index}
      isDragging={isDragging}
      isExpanded={isExpanded}
      onChange={onChange}
      onRemove={onRemove}
      onToggle={onToggle}
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        /*
         * The card's own transition includes `transform`, which would make a
         * pointer drag trail behind the cursor. While the card follows the
         * pointer it moves without a transition; sorting and keyboard moves keep
         * the one dnd-kit provides. `motion-reduce` on the card still wins.
         */
        transition: isDragging ? (transition ?? 'none') : transition,
      }}
    />
  );
}
