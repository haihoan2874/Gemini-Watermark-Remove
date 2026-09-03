/**
 * webm-muxer.js — Lightweight, standalone WebM muxer for WebCodecs
 * Encodes EncodedVideoChunks from VideoEncoder into a valid WebM Blob
 * Zero external dependencies.
 */
(() => {
  // EBML variable-length integer encoding
  function encodeVint(value, length) {
    if (length === undefined) {
      if (value < 0x7f) length = 1;
      else if (value < 0x3fff) length = 2;
      else if (value < 0x1fffff) length = 3;
      else if (value < 0x0fffffff) length = 4;
      else length = 5;
    }
    const bytes = new Uint8Array(length);
    let mask = 0x80 >> (length - 1);
    let val = value;
    for (let i = length - 1; i >= 0; i--) {
      bytes[i] = val & 0xff;
      val = val >>> 8;
    }
    bytes[0] |= mask;
    return bytes;
  }

  function encodeUint(value) {
    if (value === 0) return new Uint8Array([0]);
    const bytes = [];
    while (value > 0) {
      bytes.unshift(value & 0xff);
      value = Math.floor(value / 256);
    }
    return new Uint8Array(bytes);
  }

  function encodeFloat(value) {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, value, false);
    return new Uint8Array(buf);
  }

  function encodeString(str) {
    return new TextEncoder().encode(str);
  }

  function createEbmlElement(id, data) {
    const idBytes = encodeUint(id);
    let dataBytes;
    if (Array.isArray(data)) {
      dataBytes = concatBuffers(data);
    } else if (typeof data === 'string') {
      dataBytes = encodeString(data);
    } else if (typeof data === 'number') {
      dataBytes = encodeUint(data);
    } else {
      dataBytes = data;
    }
    const sizeBytes = encodeVint(dataBytes.length);
    return concatBuffers([idBytes, sizeBytes, dataBytes]);
  }

  function concatBuffers(buffers) {
    let totalLen = 0;
    for (const b of buffers) totalLen += b.length;
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const b of buffers) {
      result.set(b, offset);
      offset += b.length;
    }
    return result;
  }

  class SimpleWebMMuxer {
    constructor({ width, height, codec = 'V_VP9', duration = 0, codecPrivate = null }) {
      this.width = width;
      this.height = height;
      this.codec = codec;
      this.duration = duration; // in seconds
      this.codecPrivate = codecPrivate;
      this.clusters = [];
      this.currentCluster = null;
      this.currentClusterTime = 0;
    }

    addVideoChunk(chunk, meta) {
      if (meta && meta.decoderConfig && meta.decoderConfig.description) {
        this.codecPrivate = new Uint8Array(meta.decoderConfig.description);
      }

      const timestampMs = Math.round(chunk.timestamp / 1000); // chunk.timestamp is microseconds
      const isKeyframe = chunk.type === 'key';

      // Start new cluster every ~2 seconds or on first keyframe
      if (!this.currentCluster || isKeyframe || (timestampMs - this.currentClusterTime >= 2000)) {
        this.currentClusterTime = timestampMs;
        this.currentCluster = {
          time: timestampMs,
          blocks: []
        };
        this.clusters.push(this.currentCluster);
      }

      const chunkData = new Uint8Array(chunk.byteLength);
      chunk.copyTo(chunkData);

      // Create SimpleBlock
      // Track number: 1 (VINT 0x81)
      // Relative timecode: Int16 (timestampMs - clusterTime)
      // Flags: 0x80 (keyframe) or 0x00 (discardable: 0, invisible: 0)
      const relTime = Math.max(0, Math.min(32767, timestampMs - this.currentClusterTime));
      const header = new Uint8Array(4);
      header[0] = 0x81; // Track 1
      header[1] = (relTime >> 8) & 0xff;
      header[2] = relTime & 0xff;
      header[3] = isKeyframe ? 0x80 : 0x00;

      const blockPayload = concatBuffers([header, chunkData]);
      const simpleBlock = createEbmlElement(0xA3, blockPayload);
      this.currentCluster.blocks.push(simpleBlock);
    }

    finalize() {
      // 1. EBML Header
      const ebmlHeader = createEbmlElement(0x1A45DFA3, [
        createEbmlElement(0x4286, 1),            // EBMLVersion
        createEbmlElement(0x42F7, 1),            // EBMLReadVersion
        createEbmlElement(0x42F2, 4),            // EBMLMaxIDLength
        createEbmlElement(0x42F3, 8),            // EBMLMaxSizeLength
        createEbmlElement(0x4282, 'webm'),       // DocType
        createEbmlElement(0x4287, 4),            // DocTypeVersion
        createEbmlElement(0x4285, 2),            // DocTypeReadVersion
      ]);

      // 2. Info
      const durationMs = this.duration * 1000;
      const info = createEbmlElement(0x1549A966, [
        createEbmlElement(0x2AD7B1, 1000000),      // TimecodeScale (1ms)
        createEbmlElement(0x4D80, 'GeminiWatermarkRemover'), // MuxingApp
        createEbmlElement(0x5741, 'GeminiWatermarkRemover'), // WritingApp
        createEbmlElement(0x4489, encodeFloat(durationMs)), // Duration in ms
      ]);

      // 3. Track Entry
      const trackEntryElements = [
        createEbmlElement(0xD7, 1),              // TrackNumber
        createEbmlElement(0x73C5, 1),            // TrackUID
        createEbmlElement(0x83, 1),              // TrackType: 1 (video)
        createEbmlElement(0x86, this.codec),     // CodecID ('V_VP9', 'V_VP8', etc.)
        createEbmlElement(0xE0, [                // VideoSettings
          createEbmlElement(0xB0, this.width),   // PixelWidth
          createEbmlElement(0xBA, this.height),  // PixelHeight
          createEbmlElement(0x54B0, this.width), // DisplayWidth
          createEbmlElement(0x54BA, this.height),// DisplayHeight
        ])
      ];

      if (this.codecPrivate && this.codecPrivate.length > 0) {
        trackEntryElements.push(createEbmlElement(0x63A2, this.codecPrivate));
      }

      const tracks = createEbmlElement(0x1654AE6B, [
        createEbmlElement(0xAE, trackEntryElements)
      ]);

      // 4. Clusters
      const clusterElements = [];
      for (const cluster of this.clusters) {
        const clusterContent = [
          createEbmlElement(0xE7, cluster.time), // Timecode
          ...cluster.blocks
        ];
        clusterElements.push(createEbmlElement(0x1F43B675, clusterContent));
      }

      // 5. Segment
      const segment = createEbmlElement(0x18538067, [
        info,
        tracks,
        ...clusterElements
      ]);

      const fullFile = concatBuffers([ebmlHeader, segment]);
      return new Blob([fullFile], { type: 'video/webm' });
    }
  }

  // Export to global
  if (typeof window !== 'undefined') {
    window.SimpleWebMMuxer = SimpleWebMMuxer;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SimpleWebMMuxer };
  }
})();
