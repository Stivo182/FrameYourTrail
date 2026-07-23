const FILTER_NUMBER_FALLBACK = 1000000000000;
const NUMERIC_FILTER_OPERATORS = new Set(["<", "<=", ">", ">="]);

/**
 * @param {unknown} style
 */
export function sanitizeMapLibreStyleFilters(style) {
  if (!style || typeof style !== "object" || Array.isArray(style)) {
    return style;
  }

  const styleObject = /** @type {{ layers?: unknown }} */ (style);

  if (!Array.isArray(styleObject.layers)) {
    return { ...styleObject };
  }

  return {
    ...styleObject,
    layers: styleObject.layers.map((layer) => {
      if (!layer || typeof layer !== "object" || Array.isArray(layer)) {
        return layer;
      }

      const layerObject = /** @type {{ filter?: unknown, layout?: unknown }} */ (layer);
      const filter = Array.isArray(layerObject.filter)
        ? sanitizeFilterExpression(layerObject.filter)
        : undefined;
      const guardedFilter = hasRefLengthIconImage(layerObject.layout)
        ? appendFilterCondition(filter, createRefLengthIconFilter())
        : filter;

      if (!guardedFilter) {
        return { ...layerObject };
      }

      return {
        ...layerObject,
        filter: guardedFilter
      };
    })
  };
}

/**
 * @param {"class" | "subclass"} propertyName
 * @param {readonly string[]} values
 */
export function createPositivePropertyFilter(propertyName, values) {
  if (values.length === 1) {
    return ["==", ["get", propertyName], values[0]];
  }

  return ["match", ["get", propertyName], [...values], true, false];
}

/**
 * @param {unknown} expression
 * @param {"class" | "subclass"} propertyName
 * @returns {{ values: string[], isExhaustive: boolean, hasPositiveSelector: boolean } | null}
 */
export function analyzePositiveFilterProperty(expression, propertyName) {
  if (expression === undefined || expression === null || expression === true) {
    return { values: [], isExhaustive: true, hasPositiveSelector: false };
  }

  if (!Array.isArray(expression) || expression.length === 0) {
    return { values: [], isExhaustive: false, hasPositiveSelector: false };
  }

  const operator = expression[0];

  if (operator === "all") {
    /** @type {Set<string> | null} */
    let propertyValues = null;
    let isExhaustive = true;
    let hasPositiveSelector = false;

    for (const operand of expression.slice(1)) {
      const operandAnalysis = analyzePositiveFilterProperty(operand, propertyName);

      if (operandAnalysis === null) {
        return null;
      }

      isExhaustive = isExhaustive && operandAnalysis.isExhaustive;
      hasPositiveSelector = hasPositiveSelector || operandAnalysis.hasPositiveSelector;

      if (!operandAnalysis.hasPositiveSelector) {
        continue;
      }

      if (propertyValues === null) {
        propertyValues = new Set(operandAnalysis.values);
        continue;
      }

      for (const propertyValue of propertyValues) {
        if (!operandAnalysis.values.includes(propertyValue)) {
          propertyValues.delete(propertyValue);
        }
      }
    }

    return {
      values: propertyValues === null ? [] : [...propertyValues],
      isExhaustive,
      hasPositiveSelector
    };
  }

  if (operator === "any") {
    const propertyValues = new Set();

    for (const operand of expression.slice(1)) {
      const operandAnalysis = analyzePositiveFilterProperty(operand, propertyName);

      if (
        operandAnalysis === null ||
        !operandAnalysis.isExhaustive ||
        !operandAnalysis.hasPositiveSelector ||
        operandAnalysis.values.length === 0
      ) {
        return null;
      }

      for (const propertyValue of operandAnalysis.values) {
        propertyValues.add(propertyValue);
      }
    }

    return propertyValues.size === 0
      ? null
      : {
          values: [...propertyValues],
          isExhaustive: true,
          hasPositiveSelector: true
        };
  }

  if (operator === "==" && expression.length === 3) {
    const leftProperty = getFilterPropertyName(expression[1]);
    const rightProperty = getFilterPropertyName(expression[2]);

    if (leftProperty === propertyName) {
      return typeof expression[2] === "string"
        ? { values: [expression[2]], isExhaustive: true, hasPositiveSelector: true }
        : null;
    }

    if (rightProperty === propertyName) {
      return typeof expression[1] === "string"
        ? { values: [expression[1]], isExhaustive: true, hasPositiveSelector: true }
        : null;
    }

    return expressionContainsGet(expression, propertyName)
      ? null
      : { values: [], isExhaustive: false, hasPositiveSelector: false };
  }

  if (operator !== "match") {
    return expressionContainsGet(expression, propertyName)
      ? null
      : { values: [], isExhaustive: false, hasPositiveSelector: false };
  }

  if (expression.length < 5 || expression.length % 2 === 0 || expression.at(-1) !== false) {
    return null;
  }

  const positiveLabels = new Set();

  for (let index = 2; index < expression.length - 1; index += 2) {
    const output = expression[index + 1];

    if (output !== true && output !== false) {
      return null;
    }

    const labels = Array.isArray(expression[index]) ? expression[index] : [expression[index]];

    if (labels.length === 0) {
      return null;
    }

    if (output === true) {
      for (const label of labels) {
        positiveLabels.add(label);
      }
    }
  }

  if (getFilterPropertyName(expression[1]) === propertyName) {
    return [...positiveLabels].every((label) => typeof label === "string")
      ? {
          values: /** @type {string[]} */ ([...positiveLabels]),
          isExhaustive: true,
          hasPositiveSelector: true
        }
      : null;
  }

  if (
    Array.isArray(expression[1]) &&
    expression[1].length === 1 &&
    expression[1][0] === "geometry-type"
  ) {
    const polygonGeometryLabels = new Set(["Polygon", "MultiPolygon"]);
    const isPolygonGeometryGuard =
      positiveLabels.size === polygonGeometryLabels.size &&
      [...positiveLabels].every((label) => polygonGeometryLabels.has(label));

    return {
      values: [],
      isExhaustive: isPolygonGeometryGuard,
      hasPositiveSelector: false
    };
  }

  return expressionContainsGet(expression, propertyName)
    ? null
    : { values: [], isExhaustive: false, hasPositiveSelector: false };
}

/**
 * @param {unknown} expression
 */
function getFilterPropertyName(expression) {
  return Array.isArray(expression) &&
    expression.length === 2 &&
    expression[0] === "get" &&
    (expression[1] === "class" || expression[1] === "subclass")
    ? expression[1]
    : null;
}

function createRefLengthIconFilter() {
  return [">=", ["to-number", ["get", "ref_length"], -FILTER_NUMBER_FALLBACK], 1];
}

/**
 * @param {unknown} filter
 * @param {unknown[]} condition
 */
function appendFilterCondition(filter, condition) {
  if (!Array.isArray(filter)) {
    return condition;
  }

  if (filter[0] === "all") {
    return [...filter, condition];
  }

  return ["all", filter, condition];
}

/**
 * @param {unknown} layout
 */
function hasRefLengthIconImage(layout) {
  if (!layout || typeof layout !== "object" || Array.isArray(layout)) {
    return false;
  }

  const layoutObject = /** @type {{ ["icon-image"]?: unknown }} */ (layout);

  return expressionContainsGet(layoutObject["icon-image"], "ref_length");
}

/**
 * @param {unknown} expression
 * @param {string} propertyName
 */
function expressionContainsGet(expression, propertyName) {
  if (!Array.isArray(expression)) {
    return false;
  }

  if (expression[0] === "get" && expression[1] === propertyName) {
    return true;
  }

  return expression.some((operand) => expressionContainsGet(operand, propertyName));
}

/**
 * @param {unknown} expression
 * @returns {unknown}
 */
function sanitizeFilterExpression(expression) {
  if (!Array.isArray(expression)) {
    return expression;
  }

  const [operator, leftOperand, rightOperand, ...extraOperands] = expression;

  if (
    typeof operator === "string" &&
    NUMERIC_FILTER_OPERATORS.has(operator) &&
    extraOperands.length === 0
  ) {
    return [
      operator,
      sanitizeNumericFilterOperand(leftOperand, operator, "left"),
      sanitizeNumericFilterOperand(rightOperand, operator, "right")
    ];
  }

  return expression.map(sanitizeFilterExpression);
}

/**
 * @param {unknown} operand
 * @param {string} operator
 * @param {"left" | "right"} side
 */
function sanitizeNumericFilterOperand(operand, operator, side) {
  const sanitizedOperand = sanitizeFilterExpression(operand);

  if (!isGetExpression(sanitizedOperand)) {
    return sanitizedOperand;
  }

  return ["to-number", sanitizedOperand, getNumericFilterFallback(operator, side)];
}

/**
 * @param {unknown} expression
 */
function isGetExpression(expression) {
  return Array.isArray(expression) && expression[0] === "get" && typeof expression[1] === "string";
}

/**
 * @param {string} operator
 * @param {"left" | "right"} side
 */
function getNumericFilterFallback(operator, side) {
  const missingValueShouldBeHigh =
    (side === "left" && (operator === "<" || operator === "<=")) ||
    (side === "right" && (operator === ">" || operator === ">="));

  return missingValueShouldBeHigh ? FILTER_NUMBER_FALLBACK : -FILTER_NUMBER_FALLBACK;
}
