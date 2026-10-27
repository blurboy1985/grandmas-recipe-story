// Generates samples/sample.wav: 2s 440Hz sine, mono 16-bit PCM 16kHz. Fictional tone.
import { writeFileSync } from "node:fs";
const rate = 16000, seconds = 2, n = rate * seconds;
const data = Buffer.alloc(n * 2);
for (let i = 0; i < n; i++) {
  const v = Math.round(12000 * Math.sin((2 * Math.PI * 440 * i) / rate));
  data.writeInt16LE(v, i * 2);
}
const header = Buffer.alloc(44);
header.write("RIFF", 0); header.writeUInt32LE(36 + data.length, 4); header.write("WAVE", 8);
header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22); header.writeUInt32LE(rate, 24);
header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
header.write("data", 36); header.writeUInt32LE(data.length, 40);
writeFileSync(new URL("../samples/sample.wav", import.meta.url), Buffer.concat([header, data]));
console.log("wrote samples/sample.wav");
