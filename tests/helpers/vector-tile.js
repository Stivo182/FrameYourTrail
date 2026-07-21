import Pbf from "pbf";

const DEFAULT_WATERWAY_FEATURES = [
  { properties: { name: "Tributary" } },
  { properties: { name: "Tributary", brunnel: "tunnel" } }
];

/**
 * @param {{ layerName?: string, features?: { id?: number, properties: Record<string, string | number | boolean>, geometryType?: 1 | 2 }[] }} [options]
 */
export function createWaterwayVectorTile(options = {}) {
  const layer = createLayerFixture(options);
  const pbf = new Pbf();
  pbf.writeMessage(3, writeLayer, layer);
  return pbf.finish();
}

function createLayerFixture(options) {
  const keys = [];
  const values = [];
  const keyIndexes = new Map();
  const valueIndexes = new Map();
  const features = (options.features ?? DEFAULT_WATERWAY_FEATURES).map((feature) => {
    const tags = [];

    for (const [key, value] of Object.entries(feature.properties)) {
      const valueKey = `${typeof value}:${String(value)}`;

      if (!keyIndexes.has(key)) {
        keyIndexes.set(key, keys.length);
        keys.push(key);
      }

      if (!valueIndexes.has(valueKey)) {
        valueIndexes.set(valueKey, values.length);
        values.push(value);
      }

      tags.push(keyIndexes.get(key), valueIndexes.get(valueKey));
    }

    return { id: feature.id, tags, geometryType: feature.geometryType ?? 2 };
  });

  return { name: options.layerName ?? "waterway", keys, values, features };
}

function writeLayer(layer, pbf) {
  pbf.writeVarintField(15, 2);
  pbf.writeStringField(1, layer.name);

  for (const key of layer.keys) {
    pbf.writeStringField(3, key);
  }

  for (const value of layer.values) {
    pbf.writeMessage(4, writeValue, value);
  }

  for (const feature of layer.features) {
    pbf.writeMessage(2, writeFeature, feature);
  }

  pbf.writeVarintField(5, 4096);
}

function writeValue(value, pbf) {
  if (typeof value === "string") {
    pbf.writeStringField(1, value);
  } else if (typeof value === "boolean") {
    pbf.writeBooleanField(7, value);
  } else {
    pbf.writeVarintField(4, value);
  }
}

function writeFeature(feature, pbf) {
  if (feature.id !== undefined) {
    pbf.writeVarintField(1, feature.id);
  }

  pbf.writePackedVarint(2, feature.tags);
  pbf.writeVarintField(3, feature.geometryType);
  pbf.writePackedVarint(4, feature.geometryType === 2 ? [9, 20, 20, 10, 20, 20] : [9, 20, 20]);
}
