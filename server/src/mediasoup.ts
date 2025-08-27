import { createWorker } from 'mediasoup';
import {
  MediaKind,
  RtpCodecCapability,
  Worker,
} from 'mediasoup/node/lib/types';

export const createMediaSoupWorker = async () => {
  const worker = await createWorker({
    logLevel: 'debug',
  });
  console.log(`Worker created ${worker.pid}`);

  worker.on('died', () => {
    console.error(`Worker died ${worker.pid}`);
  });

  return worker;
};

export const createMediaSoupRouter = async (worker: Worker) => {
  // const mediaCodecs = [
  //   {
  //     kind: 'audio' as MediaKind,
  //     mimeType: 'audio/opus',
  //     clockRate: 48000,
  //     channels: 2,
  //   },
  //   {
  //     kind: 'video' as MediaKind,
  //     mimeType: 'video/H264',
  //     clockRate: 90000,
  //     parameters: {
  //       'packetization-mode': 1,
  //       'profile-level-id': '42e01f',
  //       'level-asymmetry-allowed': 1,
  //     },
  //   },
  // ];

  const mediaCodecs: RtpCodecCapability[] = [
    {
      /** Indicates this is an audio codec configuration */
      kind: 'audio',
      /**
       * Specifies the MIME type for the Opus codec, known for good audio quality at various bit rates.
       * Format: <type>/<subtype>, e.g., audio/opus
       */
      mimeType: 'audio/opus',
      /**
       * Specifies the number of audio samples processed per second (48,000 samples per second for high-quality audio).
       * Higher values generally allow better audio quality.
       */
      clockRate: 48000,
      /** Specifies the number of audio channels (2 for stereo audio). */
      channels: 2,
      /**
       * Optional: Specifies a preferred payload type number for the codec.
       * Helps ensure consistency in payload type numbering across different sessions or applications.
       */
      preferredPayloadType: 96, // Example value
      /**
       * Optional: Specifies a list of RTCP feedback mechanisms supported by the codec.
       * Helps optimize codec behavior in response to network conditions.
       */
      rtcpFeedback: [
        // Example values
        { type: 'nack' },
        { type: 'nack', parameter: 'pli' },
      ],
    },
    {
      /** Indicates this is a video codec configuration */
      kind: 'video',
      /** Specifies the MIME type for the VP8 codec, commonly used for video compression. */
      mimeType: 'video/VP8',
      /** Specifies the clock rate, or the number of timing ticks per second (commonly 90,000 for video). */
      clockRate: 90000,
      /**
       * Optional: Specifies codec-specific parameters.
       * In this case, sets the starting bitrate for the codec.
       */
      parameters: {
        'x-google-start-bitrate': 1000,
      },
      preferredPayloadType: 97, // Example value
      rtcpFeedback: [
        // Example values
        { type: 'nack' },
        { type: 'ccm', parameter: 'fir' },
        { type: 'goog-remb' },
      ],
    },
  ];

  const router = await worker.createRouter({ mediaCodecs });
  console.log(`Router created ${router.id}`);
  return router;
};
