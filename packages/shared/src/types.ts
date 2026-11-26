export type ElementType = "sticky" | "shape" | "text";

export type ShapeKind =
  | "rectangle"
  | "rounded-rectangle"
  | "ellipse"
  | "diamond";

export interface BoardElementBase {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Clockwise rotation angle in degrees */
  rotation: number;
  /** Lexicographical fractional index determining draw order */
  zIndexKey: string;
  updatedAt: number;
}

export interface StickyNoteElement extends BoardElementBase {
  type: "sticky";
  fill: string;
  text: string;
  fontSize: number;
}

export interface ShapeElement extends BoardElementBase {
  type: "shape";
  shapeKind: ShapeKind;
  fill: string;
  stroke: string;
  strokeWidth: number;
  text: string;
  fontSize: number;
}

export interface TextElement extends BoardElementBase {
  type: "text";
  text: string;
  color: string;
  fontSize: number;
}

export type BoardElement = StickyNoteElement | ShapeElement | TextElement;

export interface BoardMetadata {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  elementCount: number;
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export interface BoardDocument {
  metadata: BoardMetadata;
  elements: BoardElement[];
  camera: CameraState;
}

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
