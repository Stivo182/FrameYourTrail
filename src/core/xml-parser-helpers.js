/**
 * @param {Element} node
 * @param {string} localName
 * @returns {Element | null}
 */
export function findAncestor(node, localName) {
  let current = node.parentElement;

  while (current) {
    if (current.localName === localName) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

/**
 * @param {Element} node
 * @param {string} tagName
 * @returns {string | null}
 */
export function getChildText(node, tagName) {
  const child = Array.from(node.children).find((item) => item.localName === tagName);
  const text = child?.textContent?.trim();
  return text ? text : null;
}

/**
 * @param {Element} node
 * @param {string} localName
 * @returns {Element[]}
 */
export function getDirectChildrenByLocalName(node, localName) {
  return Array.from(node.children).filter((child) => child.localName === localName);
}

/**
 * @param {Element} node
 * @param {string} tagName
 * @returns {string | null}
 */
export function getDescendantText(node, tagName) {
  const child = getDescendantsByLocalName(node, tagName)[0];
  const text = child?.textContent?.trim();
  return text ? text : null;
}

/**
 * @param {Document | Element} node
 * @param {string} localName
 * @returns {Element[]}
 */
export function getDescendantsByLocalName(node, localName) {
  const root = node instanceof Document ? node.documentElement : node;

  if (!root) {
    return [];
  }

  /** @type {Element[]} */
  const matches = [];
  const visit = (element) => {
    if (element.localName === localName) {
      matches.push(element);
    }

    Array.from(element.children).forEach(visit);
  };

  visit(root);
  return matches;
}

/**
 * @param {Element[]} elements
 * @returns {string[]}
 */
export function serializeElements(elements) {
  const serializer = new XMLSerializer();
  return elements.map((element) => serializer.serializeToString(element));
}
