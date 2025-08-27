'use client';
import StreamPlayer from '@/components/StreamPlayer';
import { useMediaSoup } from '@/lib/hooks/useMediaSoup';
import React, { useEffect, useRef } from 'react';

const page = () => {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [isMicOn, setIsMicOn] = React.useState(true);
  const [isCameraOn, setIsCameraOn] = React.useState(true);
  const [stream, setStream] = React.useState<MediaStream | null>(null);

  const { isInitialized, startProducing, stopProducing, remoteStream } =
    useMediaSoup();

  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      const videoElement = remoteVideoRef.current;

      console.log(
        'Remote stream tracks:',
        remoteStream.getTracks().map((track) => ({
          kind: track.kind,
          enabled: track.enabled,
          readyState: track.readyState,
          id: track.id,
        }))
      );

      const setupVideo = async () => {
        try {
          if (videoElement.srcObject !== remoteStream) {
            videoElement.srcObject = remoteStream;
            videoElement.muted = false;

            // Log video element state
            console.log('Video element state:', {
              videoWidth: videoElement.videoWidth,
              videoHeight: videoElement.videoHeight,
              readyState: videoElement.readyState,
              paused: videoElement.paused,
              ended: videoElement.ended,
            });

            await new Promise((resolve) => {
              videoElement.addEventListener(
                'loadedmetadata',
                () => {
                  console.log('Video loadedmetadata event fired');
                  resolve(null);
                },
                { once: true }
              );
            });

            try {
              await videoElement.play();
              console.log('Remote video playback started successfully');
            } catch (error) {
              console.warn('Auto-play failed:', error);
              videoElement.controls = true;
            }
          }
        } catch (error) {
          console.error('Error setting up video:', error);
        }
      };

      setupVideo();
    }
  }, [remoteStream]);

  console.log(
    'remote stream >>>>>>>>>>>>>>>>>>',
    remoteStream?.getTracks,
    'remote ref',
    remoteVideoRef.current?.srcObject,
    'local ref',
    localVideoRef.current?.srcObject
  );

  return (
    <div className='container bg-muted flex min-h-svh flex-col items-center justify-center gap-10 p-6 md:p-10'>
      <div className='flex flex-wrap justify-center gap-8'>
        {/* Local Player */}
        <div>
          <h2 className='text-center text-lg font-semibold mb-2'>My Stream</h2>
          <StreamPlayer
            videoRef={localVideoRef}
            isStreaming={isStreaming}
            isMicOn={isMicOn}
            isCameraOn={isCameraOn}
            stream={stream}
            setIsStreaming={setIsStreaming}
            setIsMicOn={setIsMicOn}
            setIsCameraOn={setIsCameraOn}
            setStream={setStream}
            startProducing={startProducing}
            stopProducing={stopProducing}
            isInitialized={isInitialized}
          />
        </div>

        <div>
          <h2 className='text-center text-lg font-semibold mb-2'>
            Remote Stream ({remoteStream?.getTracks().length || 0} tracks)
          </h2>
          <video
            ref={remoteVideoRef}
            className='w-full h-full object-cover'
            autoPlay
            playsInline
            controls={false}
            muted={false}
            style={{
              backgroundColor: 'black',
              borderRadius: '8px',
              border: remoteStream ? '2px solid green' : '2px solid red',
              minWidth: '500px',
              minHeight: '300px',
            }}
          />
          {/* Debug info */}
          <div className='text-sm mt-2 text-gray-600'>
            <p>Remote Stream: {remoteStream ? 'Connected' : 'Not Connected'}</p>
            <p>Tracks: {remoteStream?.getTracks().length || 0}</p>
            <p>Video Tracks: {remoteStream?.getVideoTracks().length || 0}</p>
            <p>Audio Tracks: {remoteStream?.getAudioTracks().length || 0}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default page;
