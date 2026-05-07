export type BoardElementBounds = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

export type BoardElementFootprintSize = {
  height: number;
  width: number;
};

export type BoardElementPosition = {
  x: number;
  y: number;
};

export type BoardViewportSize = {
  height: number;
  width: number;
};

export const areBoardElementBoundsIntersecting = (
  leftBounds: BoardElementBounds,
  rightBounds: BoardElementBounds
) =>
  leftBounds.left < rightBounds.right &&
  leftBounds.right > rightBounds.left &&
  leftBounds.top < rightBounds.bottom &&
  leftBounds.bottom > rightBounds.top;

const getBoundedCoordinate = (
  value: number,
  elementSize: number,
  viewportSize: number
) => {
  if (viewportSize <= elementSize) {
    return viewportSize / 2;
  }

  const minValue = elementSize / 2;
  const maxValue = viewportSize - elementSize / 2;
  return Math.min(maxValue, Math.max(minValue, value));
};

const getEdgeBouncedCoordinate = (
  value: number,
  elementSize: number,
  viewportSize: number
) => {
  if (viewportSize <= elementSize) {
    return viewportSize / 2;
  }

  const minValue = elementSize / 2;
  const maxValue = viewportSize - elementSize / 2;
  if (value < minValue) {
    return getBoundedCoordinate(
      minValue + (minValue - value),
      elementSize,
      viewportSize
    );
  }

  if (value > maxValue) {
    return getBoundedCoordinate(
      maxValue - (value - maxValue),
      elementSize,
      viewportSize
    );
  }

  return value;
};

export const getBoundedBoardElementPosition = (
  position: BoardElementPosition,
  footprint: BoardElementFootprintSize,
  viewport: BoardViewportSize
): BoardElementPosition => ({
  x: getBoundedCoordinate(position.x, footprint.width, viewport.width),
  y: getBoundedCoordinate(position.y, footprint.height, viewport.height),
});

export const getEdgeBouncedBoardElementPosition = (
  position: BoardElementPosition,
  footprint: BoardElementFootprintSize,
  viewport: BoardViewportSize
): BoardElementPosition => ({
  x: getEdgeBouncedCoordinate(position.x, footprint.width, viewport.width),
  y: getEdgeBouncedCoordinate(position.y, footprint.height, viewport.height),
});
