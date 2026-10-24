import { defaultSchema } from 'rehype-sanitize'

/**
 * Sanitization schema for model-rendered HTML (rehype-raw output).
 *
 * The default GitHub schema is extended so common model output keeps
 * rendering: GFM task-list checkboxes, GitHub alert classes, and inline
 * SVG diagrams. Everything that can execute script — event handlers,
 * <script>, <iframe>, <foreignObject>, external <use>/<image> — is not
 * in the allowlist and is stripped.
 */

const SVG_GLOBAL_ATTRS = [
  'fill',
  'stroke',
  'strokeWidth',
  'strokeLinecap',
  'strokeLinejoin',
  'strokeDasharray',
  'strokeDashoffset',
  'strokeOpacity',
  'strokeMiterlimit',
  'fillOpacity',
  'fillRule',
  'clipRule',
  'opacity',
  'transform',
  'color',
  'fontSize',
  'fontFamily',
  'fontWeight',
  'fontStyle',
  'textAnchor',
  'dominantBaseline',
  'paintOrder',
  'vectorEffect',
  'display',
]

const SVG_ELEMENTS = [
  'svg',
  'g',
  'defs',
  'title',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'stop',
  'linearGradient',
  'radialGradient',
  'marker',
  'clipPath',
  'pattern',
  'symbol',
]

export const markdownSanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    // GFM task lists render as <input type="checkbox" disabled>
    'input',
    ...SVG_ELEMENTS,
  ],
  attributes: {
    ...defaultSchema.attributes,
    // GitHub alert classes (.markdown-alert-*) land on blockquote; allow
    // className globally so remark/emitted classes survive sanitization.
    '*': [
      ...(defaultSchema.attributes?.['*'] ?? []),
      'className',
      ...SVG_GLOBAL_ATTRS,
    ],
    input: [
      ...(defaultSchema.attributes?.input ?? []),
      'checked',
      'disabled',
      'type',
    ],
    svg: ['xmlns', 'viewBox', 'width', 'height', 'preserveAspectRatio', 'version'],
    path: ['d'],
    rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
    circle: ['cx', 'cy', 'r'],
    ellipse: ['cx', 'cy', 'rx', 'ry'],
    line: ['x1', 'y1', 'x2', 'y2'],
    polyline: ['points'],
    polygon: ['points'],
    text: ['x', 'y', 'dx', 'dy'],
    tspan: ['x', 'y', 'dx', 'dy'],
    stop: ['offset', 'stopColor', 'stopOpacity'],
    linearGradient: ['gradientUnits', 'gradientTransform', 'x1', 'y1', 'x2', 'y2', 'spreadMethod'],
    radialGradient: ['gradientUnits', 'gradientTransform', 'cx', 'cy', 'r', 'fx', 'fy', 'spreadMethod'],
    marker: ['markerWidth', 'markerHeight', 'markerUnits', 'refX', 'refY', 'orient', 'viewBox'],
    clipPath: ['clipPathUnits'],
    pattern: ['patternUnits', 'patternContentUnits', 'patternTransform', 'width', 'height'],
    symbol: ['viewBox', 'preserveAspectRatio'],
  },
}
