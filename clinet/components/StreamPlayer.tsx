import React from 'react';
import { Button } from './ui/button';
import { FaMicrophone, FaStop } from 'react-icons/fa';
import { IoMdMic, IoMdMicOff } from 'react-icons/io';
import { FiCamera, FiCameraOff } from 'react-icons/fi';
import { CiStop1 } from 'react-icons/ci';
import { AppData, Producer } from 'mediasoup-client/types';

interface StreamPlayerProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isStreaming: boolean;
  isMicOn: boolean;
  isCameraOn: boolean;
  stream: MediaStream | null;
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  setIsMicOn: React.Dispatch<React.SetStateAction<boolean>>;
  setIsCameraOn: React.Dispatch<React.SetStateAction<boolean>>;
  setStream: React.Dispatch<React.SetStateAction<MediaStream | null>>;
  startProducing: any;
  stopProducing: any;
  isInitialized: boolean;
}

const StreamPlayer: React.FC<StreamPlayerProps> = ({
  videoRef,
  isStreaming,
  isMicOn,
  isCameraOn,
  stream,
  setIsStreaming,
  setIsMicOn,
  setIsCameraOn,
  setStream,
  startProducing,
  stopProducing,
  isInitialized,
}) => {
  const getUserMedia = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: isCameraOn,
        audio: isMicOn,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      return mediaStream;
    } catch (error) {
      console.error('Error accessing media devices.', error);
    }
  };

  const handleMicToggle = () => {
    setIsMicOn((prev) => !prev);
    if (stream) {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
    }
  };

  const handleCameraToggle = () => {
    setIsCameraOn((prev) => !prev);
    if (stream) {
      stream.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
    }
  };

  const handleStreamToggle = async () => {
    setIsStreaming((prev) => !prev);
    if (!isStreaming) {
      const newStream = await getUserMedia();
      await startProducing(newStream);
    } else {
      setStream(null);
      await stopProducing();
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }
  };

  return (
    <div>
      <video
        ref={videoRef}
        height='300'
        width='500'
        autoPlay
        playsInline
        style={{ backgroundColor: 'black', borderRadius: '8px' }}
      ></video>
      <div className='controls'>
        <Button size={'icon'} onClick={handleMicToggle}>
          {isMicOn ? <IoMdMic /> : <IoMdMicOff />}
        </Button>
        <Button onClick={handleCameraToggle} size={'icon'}>
          {isCameraOn ? <FiCamera /> : <FiCameraOff />}
        </Button>
        <Button onClick={handleStreamToggle} disabled={!isInitialized}>
          {isStreaming ? <FaStop /> : <CiStop1 />}
        </Button>
      </div>
    </div>
  );
};

export default StreamPlayer;
