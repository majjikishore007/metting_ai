import { useEffect, useRef, useState } from 'react';
import * as mediaSoup from 'mediasoup-client';
import { io, Socket } from 'socket.io-client';
import {
  Consumer,
  Producer,
  RtpCapabilities,
  Transport,
} from 'mediasoup-client/types';

interface ConsumersMap {
  peerId: string;
  producerId: string;
  consumer: Consumer;
}

interface RemotePeers {
  videoConsumerId?: string;
  audioConsumerId?: string;
  stream: MediaStream;
}

export const useMediaSoup = () => {
  // non reactive state

  const deviceRef = useRef<mediaSoup.Device | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const producerTransportRef = useRef<Transport>(null);
  const consumerTransportRef = useRef<Transport>(null);
  const videoProducerRef = useRef<Producer | null>(null);
  const audioProducerRef = useRef<Producer | null>(null);

  const [consumers, setConsumers] = useState<Map<string, ConsumersMap>>(
    new Map()
  );
  const [remotePeers, setRemotePeers] = useState<Map<string, RemotePeers>>(
    new Map()
  ); // New: per-peer state
  const [isInitialized, setIsInitialized] = useState(false);

  // connect to the socket
  const initSocket = async () => {
    console.log('Connecting to socket.io...');
    try {
      const newSocket = io('http://localhost:8080');
      newSocket.on('connect', () => {
        console.log('Connected to socket.io server:', newSocket.id);
      });
      newSocket.on('disconnect', () => {
        console.log('Socket disconnected');
      });
      socketRef.current = newSocket;
    } catch (error) {
      console.error('Error connecting to socket:', error);
    }
  };

  // create Device
  const initDevice = async () => {
    console.log('Creating MediaSoup device...');
    try {
      const newDevice = new mediaSoup.Device();
      deviceRef.current = newDevice;
      console.log('Created NewDevice');
    } catch (error) {
      console.error('Error creating MediaSoup device:', error);
    }
  };

  // get router capabilities
  const getRouterRtpCapabilities = async () => {
    try {
      const socket = socketRef.current;

      const routerRtpCapabilities = await new Promise<RtpCapabilities>(
        (resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Timeout getting router RTP capabilities'));
          }, 5000);

          socket?.emit(
            'get-router-rtp-capabilites',
            (capabilities: RtpCapabilities) => {
              clearTimeout(timeout);
              resolve(capabilities);
            }
          );
        }
      );
      console.log(
        `PeerId ${socket?.id} Router RTP capabilities ${routerRtpCapabilities}`
      );
      console.log('Load rtpCapabilites for the device');
      deviceRef.current?.load({ routerRtpCapabilities });
    } catch (err) {
      console.error('Error getting router RTP capabilities:', err);
    }
  };

  const createSendTransport = async () => {
    try {
      const socket = socketRef.current;
      const device = deviceRef.current;
      if (!socket || !device) {
        throw new Error('Socket or device not found');
      }

      const transportInfo = await new Promise<any>((resolve, reject) => {
        socket.emit('create-transport', (data: any) => {
          if (data.error) {
            reject(data.error);
          } else {
            resolve(data);
          }
        });
      });
      const transport = device.createSendTransport(transportInfo);
      console.log(
        `Send Transport created for PeerId :${socket.id} TransprotId:${transport.id}`
      );
      producerTransportRef.current = transport;

      // Handle transport connect event
      transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          console.log('Triggere Transport connect event');
          socket.emit(
            'connect-transport',
            {
              transportId: transport.id,
              dtlsParameters,
            },
            (response: any) => {
              if (response.error) {
                console.error('Transport connect error:', response.error);
                errback(response.error);
              } else {
                console.log('Transport connected successfully');
                callback();
              }
            }
          );
        } catch (error) {
          console.error('Error in transport connect:', error);
        }
      });

      // Handle produce event
      transport.on('produce', async (parameters, callback, errback) => {
        try {
          console.log('Producing with parameters:', parameters);
          socket.emit(
            'produce',
            {
              transportId: transport.id,
              kind: parameters.kind,
              rtpParameters: parameters.rtpParameters,
            },
            (response: any) => {
              if (response.error) {
                console.error('Produce error:', response.error);
                errback(response.error);
              } else {
                console.log('Producer created with ID:', response.id);
                callback({ id: response.id });
              }
            }
          );
        } catch (error) {
          console.error('Error in produce:', error);
        }
      });

      return transport;
    } catch (error) {
      console.error('Error creating send transport:', error);
      throw error;
    }
  };

  // Create producer for a specific track
  const createProducer = async (track: MediaStreamTrack) => {
    const transport = producerTransportRef.current;
    if (!transport) throw new Error('Producer transport not available');

    const producer = await transport.produce({
      track,
      encodings:
        track.kind === 'video'
          ? [
              { maxBitrate: 100000 },
              { maxBitrate: 300000 },
              { maxBitrate: 900000 },
            ]
          : undefined,
      codecOptions: { videoGoogleStartBitrate: 1000 },
    });
    console.log(
      `PId ${socketRef.current?.id}, PT ${transport.id}, ${track.kind} producer created: ${producer.id}`
    );

    if (track.kind === 'video') videoProducerRef.current = producer;
    else if (track.kind === 'audio') audioProducerRef.current = producer;

    producer.on('transportclose', () =>
      console.log(`${track.kind} producer transport closed`)
    );
    producer.on('trackended', () =>
      console.log(`${track.kind} producer track ended`)
    );

    return producer;
  };

  // Start producing from a MediaStream
  const startProducing = async (stream: MediaStream) => {
    try {
      console.log(
        `Creating producers for peer ${socketRef.current?.id} PT ${producerTransportRef.current?.id}`
      );

      const producers: Producer[] = [];

      // Get video tracks
      const videoTracks = stream.getVideoTracks();
      for (const track of videoTracks) {
        const producer = await createProducer(track);
        producers.push(producer);
      }

      // Get audio tracks
      const audioTracks = stream.getAudioTracks();
      for (const track of audioTracks) {
        const producer = await createProducer(track);
        producers.push(producer);
      }

      console.log('All producers created successfully');
      return producers;
    } catch (error) {
      console.error('Error starting production:', error);
      throw error;
    }
  };

  // Stop all producers
  const stopProducing = async () => {
    try {
      if (videoProducerRef.current) {
        videoProducerRef.current.close();
        videoProducerRef.current = null;
      }
      if (audioProducerRef.current) {
        audioProducerRef.current.close();
        audioProducerRef.current = null;
      }
      console.log('All producers stopped');
    } catch (error) {
      console.error('Error stopping producers:', error);
    }
  };

  const createReciveTransport = async () => {
    try {
      const socket = socketRef.current;
      const device = deviceRef.current;
      if (!socket || !device) {
        throw new Error('Socket or device not found');
      }
      const transportInfo = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout creating recive transport'));
        }, 10000);
        socket.emit('create-transport', (data: any) => {
          clearTimeout(timeout);
          if (data.error) {
            reject(data.error);
          } else {
            resolve(data);
          }
        });
      });

      const transport = device.createRecvTransport(transportInfo);
      console.log(
        `Recive Transport created for PeerId :${socket.id} TransprotId:${transport.id}`
      );
      consumerTransportRef.current = transport;

      transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          socket.emit(
            'connect-transport',
            {
              transportId: transport.id,
              dtlsParameters,
            },
            (response: any) => {
              if (response.error) {
                console.error('Transport connect error:', response.error);
                errback(response.error);
              } else {
                console.log('Transport connected successfully');
                callback();
              }
            }
          );
        } catch (error) {
          console.error('Error in conncting the reciver traport', error);
        }
      });
      return transport;
    } catch (error) {
      console.error('Error in create Recive Transport', error);
    }
  };

  const consumeStream = async (
    producerId: string,
    peerId: string,
    kind: string
  ) => {
    try {
      const socket = socketRef.current;
      const device = deviceRef.current;
      const consumerTransport = consumerTransportRef.current;

      console.log('Consuming media for producer:', producerId);
      if (!socket || !device || !consumerTransport) {
        return;
      }
      const { rtpCapabilities } = device;

      const consumerParams = await new Promise<any>((resolve, reject) => {
        socket.emit(
          'consume',
          {
            transportId: consumerTransport.id,
            producerId,
            rtpCapabilities,
          },
          (params: any) => {
            if (params.error) {
              reject(params.error);
            } else {
              console.log('Consumer parameters received:', {
                id: params.id,
                kind: params.kind,
                rtpParameters: params.rtpParameters,
              });
              resolve(params);
            }
          }
        );
      });

      const consumer = await consumerTransport.consume(consumerParams);

      console.log('Consumer created:', {
        id: consumer.id,
        kind: consumer.kind,
        track: {
          kind: consumer.track.kind,
          enabled: consumer.track.enabled,
          readyState: consumer.track.readyState,
        },
      });
      // store peerId and producerIds
      setConsumers((prev) => {
        const updated = new Map(prev);
        updated.set(consumer.id, { consumer, peerId, producerId });
        return updated;
      });

      // Resume the consumer immediately
      await new Promise<void>((resolve, reject) => {
        socket.emit(
          'resume-consumer',
          { consumerId: consumer.id },
          // The callback now expects an object with a potential error property
          (response?: { error?: string; resumed?: boolean }) => {
            if (response?.error) {
              console.error(
                'Server failed to resume consumer:',
                response.error
              );
              reject(new Error(response.error)); // Reject the promise if the server sends an error
            } else {
              // The server successfully resumed the consumer
              resolve();
            }
          }
        );
      });

      console.log(`Consumer ${consumer.id} resumed`);

      // Handle consumer events
      consumer.on('transportclose', () => {
        console.log('Consumer transport closed:', consumer.id);
        setConsumers((prev) => {
          const updated = new Map(prev);
          updated.delete(consumer.id);
          return updated;
        });
      });

      consumer.on('trackended', () => {
        console.log('Consumer track ended:', consumer.id);
        setConsumers((prev) => {
          const updated = new Map(prev);
          updated.delete(consumer.id);
          return updated;
        });
      });

      updatePeerStream(peerId, consumer, kind);
    } catch (error) {
      console.error('Error consuming stream:', error);
    }
  };

  const removeConsumer = (consumerId: string) => {
    setConsumers((prev) => {
      const consumerData = prev.get(consumerId);
      if (consumerData) {
        consumerData.consumer.close();

        // Update peer stream
        updatePeerStream(consumerData.peerId, null, consumerData.consumer.kind);
      }
      const updated = new Map(prev);
      updated.delete(consumerId);
      return updated;
    });
  };

  const updatePeerStream = (
    peerId: string,
    consumer: Consumer | null,
    kind: string
  ) => {
    setRemotePeers((prev) => {
      const updated = new Map(prev);
      let peer = updated.get(peerId) || { stream: new MediaStream() };

      if (consumer) {
        // Add track if live
        if (consumer.track.readyState === 'live') {
          peer.stream.addTrack(consumer.track);
          if (kind === 'video') {
            peer.videoConsumerId = consumer.id;
          } else if (kind === 'audio') {
            peer.audioConsumerId = consumer.id;
          }
          console.log(`Added ${kind} track to peer ${peerId} stream`);
        }
      } else {
        // Remove track (consumer is null on removal)
        const tracks = peer.stream.getTracks();
        const trackToRemove = tracks.find((t) => t.kind === kind);
        if (trackToRemove) {
          peer.stream.removeTrack(trackToRemove);
          console.log(`Removed ${kind} track from peer ${peerId} stream`);
        }
        if (kind === 'video') {
          delete peer.videoConsumerId;
        } else if (kind === 'audio') {
          delete peer.audioConsumerId;
        }
        // If no consumers left, remove peer
        if (!peer.videoConsumerId && !peer.audioConsumerId) {
          updated.delete(peerId);
          console.log(`Removed peer ${peerId} as no consumers left`);
          return updated;
        }
      }

      updated.set(peerId, peer);
      return updated;
    });
  };

  // Initialize everything
  const init = async () => {
    try {
      // init socket
      await initSocket();
      const socket = socketRef.current;

      if (!socket) {
        throw new Error('Socket Cration Failed');
      }
      await initDevice();
      if (!deviceRef) {
        throw new Error('Device Creation Failed');
      }
      // get router RtpCapabilities
      await getRouterRtpCapabilities();
      await createSendTransport();
      await createReciveTransport();

      socketRef.current?.on('existing-producers', ({ producerIds }) => {
        console.log(`Received ${producerIds.length} existing producers.`);
        for (const { producerId, peerId, kind } of producerIds) {
          consumeStream(producerId, peerId, kind);
        }
      });

      // listner for the server boardcast event
      socketRef.current?.on('new-producer', ({ producerId, peerId, kind }) => {
        console.log(
          'New producer available ',
          producerId,
          'from peer',
          peerId,
          'kind',
          kind
        );
        consumeStream(producerId, peerId, kind);
      });

      socket.on('producer-closed', ({ producerId }) => {
        console.log('Producer closed notification:', producerId);
      });

      // handle peer-left
      socket.on('peer-left', ({ peerId }) => {
        console.log('Peer left:', peerId);
        setRemotePeers((prev) => {
          const updated = new Map(prev);
          updated.delete(peerId);
          return updated;
        });
        // Also clean any lingering consumers for this peer
        setConsumers((prev) => {
          const updated = new Map(prev);
          prev.forEach((data, cid) => {
            if (data.peerId === peerId) {
              data.consumer.close();
              updated.delete(cid);
            }
          });
          return updated;
        });
      });

      setIsInitialized(true);
      console.log('MediaSoup initialization complete');
    } catch (error) {
      console.error('Error initializing MediaSoup:', error);
      setIsInitialized(false);
    }
  };

  useEffect(() => {
    init();

    return () => {
      // Cleanup logic
      socketRef.current?.disconnect();
      videoProducerRef.current?.close();
      audioProducerRef.current?.close();
      producerTransportRef.current?.close();
      consumerTransportRef.current?.close();
    };
  }, []); // Ensure this runs only once

  return {
    isInitialized,
    startProducing,
    stopProducing,
    remoteStreams: Array.from(remotePeers.entries()).map(
      ([peerId, { stream }]) => ({ peerId, stream })
    ),
  };
};
