import { useEffect, useState } from 'react';
import * as mediaSoup from 'mediasoup-client';
import { io, Socket } from 'socket.io-client';
import {
  Consumer,
  Producer,
  RtpCapabilities,
  Transport,
} from 'mediasoup-client/types';

export const useMediaSoup = () => {
  const [device, setDevice] = useState<mediaSoup.Device | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [producerTransport, setProducerTransport] = useState<Transport | null>(
    null
  );
  const [consumerTransport, setConsumerTransport] = useState<Transport | null>(
    null
  );
  const [videoProducer, setVideoProducer] = useState<Producer | null>(null);
  const [audioProducer, setAudioProducer] = useState<Producer | null>(null);
  const [consumers, setConsumers] = useState<Map<string, Consumer>>(new Map());
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null); // ADDED: State for remote stream
  const [isInitialized, setIsInitialized] = useState(false);

  // connect to the socket
  const initSocket = () => {
    console.log('Connecting to socket.io...');
    try {
      const newSocket = io('http://localhost:8080');
      newSocket.on('connect', () => {
        console.log('Connected to socket.io server:', newSocket.id);
      });
      newSocket.on('disconnect', () => {
        console.log('Socket disconnected');
      });
      setSocket(newSocket);
      return newSocket;
    } catch (error) {
      console.error('Error connecting to socket:', error);
    }
  };

  // create Device
  const initDevice = async () => {
    console.log('Creating MediaSoup device...');
    try {
      const newDevice = new mediaSoup.Device();
      setDevice(newDevice);
      return newDevice;
    } catch (error) {
      console.error('Error creating MediaSoup device:', error);
    }
  };

  // get router capabilities
  const getRouterRtpCapabilities = async (socket: Socket) => {
    console.log('Get router rtpCapabilites ', socket.id);

    try {
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
      console.log('Router RTP capabilities:', routerRtpCapabilities);
      return routerRtpCapabilities;
    } catch (err) {
      console.error('Error getting router RTP capabilities:', err);
    }
  };

  const createSendTransport = async (
    socket: Socket,
    device: mediaSoup.Device
  ) => {
    try {
      console.log('Create send Transport ', socket.id);

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
      console.log('Producer transport created:', transport.id);
      setProducerTransport(transport);

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
    if (!producerTransport) {
      throw new Error('Producer transport not available');
    }

    try {
      const producer = await producerTransport.produce({
        track,
        encodings:
          track.kind === 'video'
            ? [
                { maxBitrate: 100000 },
                { maxBitrate: 300000 },
                { maxBitrate: 900000 },
              ]
            : undefined,
        codecOptions: {
          videoGoogleStartBitrate: 1000,
        },
      });

      console.log(`${track.kind} producer created:`, producer.id);

      if (track.kind === 'video') {
        setVideoProducer(producer);
      } else if (track.kind === 'audio') {
        setAudioProducer(producer);
      }

      // Handle producer events
      producer.on('transportclose', () => {
        console.log(`${track.kind} producer transport closed`);
      });

      producer.on('trackended', () => {
        console.log(`${track.kind} producer track ended`);
      });

      return producer;
    } catch (error) {
      console.error(`Error creating ${track.kind} producer:`, error);
      throw error;
    }
  };

  // Start producing from a MediaStream
  const startProducing = async (stream: MediaStream) => {
    console.log('start producing', producerTransport?.id);

    if (!producerTransport) {
      throw new Error('Producer transport not ready');
    }

    try {
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
      if (videoProducer) {
        videoProducer.close();
        setVideoProducer(null);
      }
      if (audioProducer) {
        audioProducer.close();
        setAudioProducer(null);
      }
      console.log('All producers stopped');
    } catch (error) {
      console.error('Error stopping producers:', error);
    }
  };

  const createReciveTransport = async (
    socket: Socket,
    device: mediaSoup.Device
  ) => {
    console.log('Create Recive transport', socket.id);

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
    console.log('Created recive transport', transport.id);
    setConsumerTransport(transport);

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
  };

  const consumeStream = async (
    device: mediaSoup.Device,
    socket: Socket,
    consumerTransport: Transport,
    producerId: string
  ) => {
    if (!device || !consumerTransport || !socket) {
      return;
    }
    try {
      console.log('Consuming media for producer:', producerId);
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
              // Add debug logging for consumer parameters
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

      // Add detailed logging for the consumer
      console.log('Consumer created:', {
        id: consumer.id,
        kind: consumer.kind,
        track: {
          kind: consumer.track.kind,
          enabled: consumer.track.enabled,
          readyState: consumer.track.readyState,
        },
      });

      setConsumers((prev) => {
        const updated = new Map(prev);
        updated.set(consumer.id, consumer);

        // Log the state of all consumers
        console.log('Updated consumers:', {
          total: updated.size,
          videoTracks: Array.from(updated.values()).filter(
            (c) => c.kind === 'video'
          ).length,
          audioTracks: Array.from(updated.values()).filter(
            (c) => c.kind === 'audio'
          ).length,
        });

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
    } catch (error) {
      console.error('Error consuming stream:', error);
    }
  };

  // Initialize everything
  const init = async () => {
    try {
      console.log('Initializing MediaSoup...');

      // init socket
      const newSocket = initSocket();
      if (!newSocket) {
        throw new Error('Failed to initialize socket');
      }

      // Wait for socket connection
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Socket connection timeout'));
        }, 10000);

        if (newSocket.connected) {
          clearTimeout(timeout);
          resolve();
        } else {
          newSocket.on('connect', () => {
            clearTimeout(timeout);
            resolve();
          });
        }
      });

      // init device
      const newDevice = await initDevice();
      if (!newDevice) {
        throw new Error('Failed to initialize device');
      }

      // get router RtpCapabilities
      const routerRtpCapabilities = await getRouterRtpCapabilities(newSocket);
      if (!routerRtpCapabilities) {
        throw new Error('Failed to get router RTP capabilities');
      }

      // load device with router capabilities
      await newDevice.load({ routerRtpCapabilities });
      console.log('Device loaded with RTP capabilities');

      // create producer transport
      await createSendTransport(newSocket, newDevice);
      const newConsumerTransport = await createReciveTransport(
        newSocket,
        newDevice
      );

      newSocket.on('existing-producers', ({ producerIds }) => {
        console.log(`Received ${producerIds.length} existing producers.`);
        for (const producerId of producerIds) {
          consumeStream(newDevice, newSocket, newConsumerTransport, producerId);
        }
      });

      // listner for the server boardcast event
      newSocket.on('new-producer', ({ producerId }) => {
        console.log('New producer available ', producerId);
        consumeStream(newDevice, newSocket, newConsumerTransport, producerId);
      });
      setIsInitialized(true);
      console.log('MediaSoup initialization complete');
    } catch (error) {
      console.error('Error initializing MediaSoup:', error);
      setIsInitialized(false);
    }
  };

  useEffect(() => {
    console.log('Setting up remote stream, consumers:', consumers.size);

    if (consumers.size === 0) {
      setRemoteStream(null);
      return;
    }

    try {
      const newStream = new MediaStream();
      let videoTracksAdded = 0;
      let audioTracksAdded = 0;

      consumers.forEach((consumer) => {
        if (consumer.track.readyState === 'live') {
          try {
            newStream.addTrack(consumer.track);
            if (consumer.kind === 'video') {
              videoTracksAdded++;
              console.log('Added video track:', {
                id: consumer.track.id,
                enabled: consumer.track.enabled,
                readyState: consumer.track.readyState,
                constraints: consumer.track.getConstraints(),
              });
            } else if (consumer.kind === 'audio') {
              audioTracksAdded++;
            }
          } catch (e) {
            console.error('Error adding track to stream:', e);
          }
        } else {
          console.warn('Track not live:', {
            kind: consumer.kind,
            readyState: consumer.track.readyState,
          });
        }
      });

      console.log('New remote stream created:', {
        id: newStream.id,
        videoTracks: videoTracksAdded,
        audioTracks: audioTracksAdded,
        totalTracks: newStream.getTracks().length,
      });

      if (newStream.getTracks().length > 0) {
        setRemoteStream(newStream);
      }
    } catch (error) {
      console.error('Error creating remote stream:', error);
    }
  }, [consumers]);

  useEffect(() => {
    init();

    return () => {
      // Cleanup logic
      if (socket) {
        socket.disconnect();
      }
      videoProducer?.close();
      audioProducer?.close();
      producerTransport?.close();
      consumerTransport?.close();
    };
  }, []); // Ensure this runs only once

  return {
    isInitialized,
    startProducing,
    stopProducing,
    remoteStream,
  };
};
