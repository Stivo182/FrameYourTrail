import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const OUTPUT_PATH = resolve("tests/fixtures/minimal-activity.fit");
const FIT_EPOCH_MS = Date.UTC(1989, 11, 31);
const PROTOCOL_VERSION = 16;
const PROFILE_VERSION = 2132;
const HEADER_LENGTH = 14;

const BASE_TYPES = Object.freeze({
  enum: { size: 1, number: 0x00, write: "writeUInt8" },
  uint8: { size: 1, number: 0x02, write: "writeUInt8" },
  uint16: { size: 2, number: 0x84, write: "writeUInt16LE" },
  uint32: { size: 4, number: 0x86, write: "writeUInt32LE" },
  sint32: { size: 4, number: 0x85, write: "writeInt32LE" }
});

const GLOBAL_MESSAGES = Object.freeze({
  fileId: 0,
  session: 18,
  lap: 19,
  record: 20,
  event: 21
});

const START_TIME = new Date("2024-05-25T08:00:00.000Z");
const POINTS = [
  { elapsedSeconds: 0, latitude: 43.1, longitude: 42.1, altitude: 620, distance: 0, speed: 1.0 },
  {
    elapsedSeconds: 300,
    latitude: 43.101,
    longitude: 42.102,
    altitude: 640,
    distance: 240,
    speed: 1.25
  },
  {
    elapsedSeconds: 720,
    latitude: 43.103,
    longitude: 42.105,
    altitude: 700,
    distance: 600,
    speed: 2.5
  }
];

const SESSION = Object.freeze({
  totalDistance: 600,
  totalElapsedTime: 720,
  totalTimerTime: 700,
  avgSpeed: 1,
  maxSpeed: 2.5,
  totalAscent: 80,
  totalDescent: 0
});

const WRITER_BY_TYPE = Object.fromEntries(
  Object.entries(BASE_TYPES).map(([name, value]) => [name, value.write])
);

const chunks = [];

defineMessage(0, GLOBAL_MESSAGES.fileId, [
  field(0, "enum"),
  field(1, "uint16"),
  field(2, "uint16"),
  field(3, "uint32"),
  field(4, "uint32")
]);
dataMessage(0, [
  value("enum", 4),
  value("uint16", 1),
  value("uint16", 1),
  value("uint32", 20240525),
  value("uint32", fitTimestamp(START_TIME))
]);

defineMessage(1, GLOBAL_MESSAGES.record, [
  field(253, "uint32"),
  field(0, "sint32"),
  field(1, "sint32"),
  field(2, "uint16"),
  field(5, "uint32"),
  field(6, "uint16")
]);
for (const point of POINTS) {
  dataMessage(1, [
    value("uint32", fitTimestampAt(point.elapsedSeconds)),
    value("sint32", degreesToSemicircles(point.latitude)),
    value("sint32", degreesToSemicircles(point.longitude)),
    value("uint16", scaledAltitude(point.altitude)),
    value("uint32", Math.round(point.distance * 100)),
    value("uint16", Math.round(point.speed * 1000))
  ]);
}

defineMessage(2, GLOBAL_MESSAGES.lap, [
  field(253, "uint32"),
  field(0, "enum"),
  field(1, "enum"),
  field(2, "uint32"),
  field(7, "uint32"),
  field(8, "uint32"),
  field(9, "uint32"),
  field(13, "uint16"),
  field(14, "uint16"),
  field(21, "uint16"),
  field(22, "uint16")
]);
dataMessage(2, [
  value("uint32", fitTimestampAt(SESSION.totalElapsedTime)),
  value("enum", 9),
  value("enum", 1),
  value("uint32", fitTimestamp(START_TIME)),
  value("uint32", SESSION.totalElapsedTime * 1000),
  value("uint32", SESSION.totalTimerTime * 1000),
  value("uint32", SESSION.totalDistance * 100),
  value("uint16", Math.round(SESSION.avgSpeed * 1000)),
  value("uint16", Math.round(SESSION.maxSpeed * 1000)),
  value("uint16", SESSION.totalAscent),
  value("uint16", SESSION.totalDescent)
]);

defineMessage(3, GLOBAL_MESSAGES.event, [field(253, "uint32"), field(0, "enum"), field(1, "enum")]);
dataMessage(3, [value("uint32", fitTimestamp(START_TIME)), value("enum", 0), value("enum", 0)]);
dataMessage(3, [value("uint32", fitTimestampAt(700)), value("enum", 0), value("enum", 4)]);

defineMessage(4, GLOBAL_MESSAGES.session, [
  field(253, "uint32"),
  field(0, "enum"),
  field(1, "enum"),
  field(2, "uint32"),
  field(3, "sint32"),
  field(4, "sint32"),
  field(5, "enum"),
  field(6, "enum"),
  field(7, "uint32"),
  field(8, "uint32"),
  field(9, "uint32"),
  field(14, "uint16"),
  field(15, "uint16"),
  field(22, "uint16"),
  field(23, "uint16")
]);
dataMessage(4, [
  value("uint32", fitTimestampAt(SESSION.totalElapsedTime)),
  value("enum", 9),
  value("enum", 1),
  value("uint32", fitTimestamp(START_TIME)),
  value("sint32", degreesToSemicircles(POINTS[0].latitude)),
  value("sint32", degreesToSemicircles(POINTS[0].longitude)),
  value("enum", 17),
  value("enum", 0),
  value("uint32", SESSION.totalElapsedTime * 1000),
  value("uint32", SESSION.totalTimerTime * 1000),
  value("uint32", SESSION.totalDistance * 100),
  value("uint16", Math.round(SESSION.avgSpeed * 1000)),
  value("uint16", Math.round(SESSION.maxSpeed * 1000)),
  value("uint16", SESSION.totalAscent),
  value("uint16", SESSION.totalDescent)
]);

const data = Buffer.concat(chunks);
const header = createHeader(data.byteLength);
const fileCrc = uint16Buffer(calculateCrc(data));
const output = Buffer.concat([header, data, fileCrc]);

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, output);

console.log(`Wrote ${OUTPUT_PATH} (${output.byteLength} bytes)`);

function defineMessage(localMessageNumber, globalMessageNumber, fields) {
  chunks.push(Buffer.from([0x40 | localMessageNumber, 0, 0]));
  chunks.push(uint16Buffer(globalMessageNumber));
  chunks.push(Buffer.from([fields.length]));

  for (const currentField of fields) {
    chunks.push(
      Buffer.from([
        currentField.number,
        BASE_TYPES[currentField.type].size,
        BASE_TYPES[currentField.type].number
      ])
    );
  }
}

function dataMessage(localMessageNumber, values) {
  const buffers = [Buffer.from([localMessageNumber])];

  for (const currentValue of values) {
    const buffer = Buffer.alloc(BASE_TYPES[currentValue.type].size);
    buffer[WRITER_BY_TYPE[currentValue.type]](currentValue.data, 0);
    buffers.push(buffer);
  }

  chunks.push(Buffer.concat(buffers));
}

function field(number, type) {
  return { number, type };
}

function value(type, data) {
  return { type, data };
}

function createHeader(dataSize) {
  const header = Buffer.alloc(HEADER_LENGTH);
  header.writeUInt8(HEADER_LENGTH, 0);
  header.writeUInt8(PROTOCOL_VERSION, 1);
  header.writeUInt16LE(PROFILE_VERSION, 2);
  header.writeUInt32LE(dataSize, 4);
  header.write(".FIT", 8, "ascii");
  header.writeUInt16LE(calculateCrc(header.subarray(0, 12)), 12);
  return header;
}

function fitTimestamp(date) {
  return Math.round((date.getTime() - FIT_EPOCH_MS) / 1000);
}

function fitTimestampAt(elapsedSeconds) {
  return fitTimestamp(new Date(START_TIME.getTime() + elapsedSeconds * 1000));
}

function degreesToSemicircles(value) {
  return Math.round((value * 2 ** 31) / 180);
}

function scaledAltitude(value) {
  return Math.round((value + 500) * 5);
}

function uint16Buffer(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value, 0);
  return buffer;
}

function calculateCrc(buffer) {
  const crcTable = [
    0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401,
    0x5000, 0x9c01, 0x8801, 0x4400
  ];
  let crc = 0;

  for (const byte of buffer) {
    let tmp = crcTable[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ crcTable[byte & 0xf];
    tmp = crcTable[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ crcTable[(byte >> 4) & 0xf];
  }

  return crc;
}
