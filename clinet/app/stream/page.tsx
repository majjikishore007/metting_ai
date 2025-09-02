'use client';
import RemoteStream from '@/components/RemoteStream';
import StreamPlayer from '@/components/StreamPlayer';
import { useMediaSoup } from '@/lib/hooks/useMediaSoup';
import React, { useEffect, useRef } from 'react';

const page = () => {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [isMicOn, setIsMicOn] = React.useState(true);
  const [isCameraOn, setIsCameraOn] = React.useState(true);
  const [stream, setStream] = React.useState<MediaStream | null>(null);

  const { isInitialized, startProducing, stopProducing, remoteStreams } =
    useMediaSoup();

  useEffect(() => {
    console.log('remoteStreams:::::::', remoteStreams);
  }, [remoteStreams]);

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

        {/* Remote Streams Grid */}
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'>
          {remoteStreams.length > 0 ? (
            remoteStreams.map(({ peerId, stream }) => (
              <div key={peerId} className='w-full'>
                <h2 className='text-center text-lg font-semibold mb-2'>
                  Remote Stream
                </h2>
                <RemoteStream stream={stream} peerId={peerId} />
              </div>
            ))
          ) : (
            <div className='col-span-full text-center text-gray-500'>
              No remote streams available
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default page;
