// A valid, short PCM WAV containing digital silence. Keep the legacy cue URLs
// playable so already-open pages cannot fetch the upstream audible files.
const sampleRate = 8000;
const dataLength = sampleRate / 10 * 2;
const silentAudio = Buffer.alloc(44 + dataLength);
silentAudio.write("RIFF", 0);
silentAudio.writeUInt32LE(silentAudio.length - 8, 4);
silentAudio.write("WAVEfmt ", 8);
silentAudio.writeUInt32LE(16, 16);
silentAudio.writeUInt16LE(1, 20);
silentAudio.writeUInt16LE(1, 22);
silentAudio.writeUInt32LE(sampleRate, 24);
silentAudio.writeUInt32LE(sampleRate * 2, 28);
silentAudio.writeUInt16LE(2, 32);
silentAudio.writeUInt16LE(16, 34);
silentAudio.write("data", 36);
silentAudio.writeUInt32LE(dataLength, 40);

function sendSilentAudio(_request, response) {
  response.set({ "Content-Type": "audio/wav", "Cache-Control": "no-store" });
  response.send(silentAudio);
}

module.exports = { sendSilentAudio };
