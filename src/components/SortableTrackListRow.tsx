import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { TrackRow } from '../types';
import TrackListRow from './TrackListRow';

type Props = {
  track: TrackRow;
  position?: number;
  transitionCost?: number | null;
  isolationCost?: number | null;
};

export default function SortableTrackListRow({
  track,
  position,
  transitionCost,
  isolationCost,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: track.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 2 : undefined,
    opacity: isDragging ? 0.85 : undefined,
  };

  const dragHandle = (
    <button
      type="button"
      className="list-drag-handle"
      aria-label={`Reorder ${track.name}`}
      title="Drag to reorder"
      {...attributes}
      {...listeners}
    >
      <svg width="12" height="16" viewBox="0 0 12 16" aria-hidden="true">
        <circle cx="3" cy="3" r="1.3" />
        <circle cx="9" cy="3" r="1.3" />
        <circle cx="3" cy="8" r="1.3" />
        <circle cx="9" cy="8" r="1.3" />
        <circle cx="3" cy="13" r="1.3" />
        <circle cx="9" cy="13" r="1.3" />
      </svg>
    </button>
  );

  return (
    <TrackListRow
      ref={setNodeRef}
      track={track}
      position={position}
      transitionCost={transitionCost}
      isolationCost={isolationCost}
      dragHandle={dragHandle}
      style={style}
      className={isDragging ? 'dragging' : undefined}
    />
  );
}
