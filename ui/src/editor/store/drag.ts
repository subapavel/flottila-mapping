/**
 * The drag data type of a source row, holding its field path. Editor folders meet through the store (ADR-0013): a
 * source row dropped on a target row links the two, on an orphaned source-field box it remaps the box.
 */
export const SOURCE_FIELD_DRAG = 'application/x-flottila-source-field';
