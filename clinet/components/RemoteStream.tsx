import React, { useEffect, useRef } from 'react';

interface RemoteStreamProps {
  stream: MediaStream;
  peerId: string;
}

const RemoteStream: React.FC<RemoteStreamProps> = ({ stream, peerId }) => {
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (remoteVideoRef.current && stream) {
      remoteVideoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className='relative'>
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
          border: stream ? '2px solid green' : '2px solid red',
          minWidth: '300px',
          minHeight: '200px',
        }}
      />
      <div className='absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-white text-sm'>
        {peerId}
      </div>
    </div>
  );
};

export default RemoteStream;
