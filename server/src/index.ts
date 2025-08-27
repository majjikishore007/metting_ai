import { createServer } from 'http';
import { Server } from 'socket.io';
import { createMediaSoupRouter, createMediaSoupWorker } from './mediasoup';
import {
  Consumer,
  Producer,
  Router,
  Transport,
} from 'mediasoup/node/lib/types';

const httpServer = createServer();

const io = new Server(httpServer, {
  cors: {
    origin: '*',
  },
});
interface Peers {
  tranports: Map<string, Transport>;
  producers: Map<string, Producer>;
  consumer: Map<string, Consumer>;
}

const createWebRtcTransport = async (
  router: Router,
  callback: CallableFunction
) => {
  try {
    const transport = await router.createWebRtcTransport({
      listenIps: ['127.0.0.1'],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    });
    console.log('Creating webrtc-transport', transport.id);

    transport.on('dtlsstatechange', (dtlsState) => {
      console.log('DTLS state changed:', dtlsState);
      if (dtlsState === 'closed') {
        transport.close();
      }
    });

    transport.on('@close', () => {
      console.log('Transport closed:', transport.id);
    });

    callback({
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    });
    return transport;
  } catch (error) {
    console.error('Error creating webrtc-transport:', error);
    callback({ error: 'Error creating transport' });
  }
};

(async () => {
  // create a media soup worker
  const worker = await createMediaSoupWorker();
  const router = await createMediaSoupRouter(worker);

  const peers = new Map<string, Peers>();

  io.on('connect', (socket) => {
    console.log('A user connected:', socket.id);

    peers.set(socket.id, {
      tranports: new Map(),
      producers: new Map(),
      consumer: new Map(),
    });

    console.log(`Informing peer ${socket.id} about existing producers...`);
    const allProducerIds: string[] = [];
    peers.forEach((peer, peerId) => {
      // Don't send a peer its own producers
      if (peerId !== socket.id) {
        peer.producers.forEach((producer) => {
          allProducerIds.push(producer.id);
        });
      }
    });
    // Use a specific event for this initial list
    socket.emit('existing-producers', { producerIds: allProducerIds });
    console.log(
      `Sent ${allProducerIds.length} existing producer IDs to ${socket.id}`
    );

    // get router-rtp-capabalites
    socket.on('get-router-rtp-capabilites', (callback) => {
      callback(router.rtpCapabilities);
    });

    // create webRtcTransport
    socket.on('create-transport', async (callback) => {
      const tranport = await createWebRtcTransport(router, callback);
      if (tranport) {
        peers.get(socket.id).tranports.set(tranport.id, tranport);
      }
    });
    // clients call this event
    socket.on(
      'connect-transport',
      async ({ transportId, dtlsParameters }, callback, errback) => {
        try {
          console.log(
            `TransportId ${transportId} and dltsParameters ${dtlsParameters}`
          );
          const transport = peers.get(socket.id).tranports.get(transportId);
          if (!transport) {
            console.error(`No tranport found with id ${transportId}`);
            return errback({
              error: `No tranport found with id ${transportId}`,
            });
          }
          await transport.connect({ dtlsParameters });
          callback({ connected: true });
        } catch (error) {
          console.error('Error connecting transport:', error);
        }
      }
    );
    socket.on(
      'produce',
      async ({ transportId, kind, rtpParameters }, callback, errback) => {
        try {
          const transport = peers.get(socket.id).tranports.get(transportId);
          if (!transport) {
            console.error(`No tranport found with id ${transportId}`);
            return errback({
              error: `No tranport found with id ${transportId}`,
            });
          }
          const producer = await transport.produce({
            kind,
            rtpParameters,
          });

          peers.get(socket.id).producers.set(producer.id, producer);

          console.log('Producer Id', producer.id, 'producer kind', kind);

          producer.on('transportclose', () => {
            console.log('Transport got closed', producer.id);
            producer.close();
            peers.get(socket.id).producers.delete(producer.id);
          });

          // inform all the other peers
          socket.broadcast.emit('new-producer', { producerId: producer.id });

          callback({
            id: producer.id,
          });
        } catch (error) {
          console.error('Error in producing', error);
          errback({ error });
        }
      }
    );

    socket.on(
      'consume',
      async (
        { transportId, producerId, rtpCapabilities },
        callback,
        errback
      ) => {
        try {
          const transport = peers.get(socket.id).tranports.get(transportId);
          if (!transport) {
            console.error(`No tranport found with id ${transportId}`);
            return errback({
              error: `No tranport found with id ${transportId}`,
            });
          }
          if (!router.canConsume({ producerId, rtpCapabilities })) {
            return errback({
              error: 'Client cannot consume the producer',
            });
          }
          const consumer = await transport.consume({
            producerId,
            rtpCapabilities,
            paused: true,
          });
          peers.get(socket.id).consumer.set(consumer.id, consumer);
          callback({
            id: consumer.id,
            producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
          });
        } catch (error) {
          console.error('Error in producing', error);
          errback({ error });
        }
      }
    );

    socket.on('resume-consumer', async ({ consumerId }, callback) => {
      try {
        const consumer = peers.get(socket.id)?.consumer.get(consumerId);
        if (!consumer) {
          console.error(`Consumer not found for resumption: ${consumerId}`);
          // Inform the client that the consumer was not found
          return callback({
            error: `Consumer with id ${consumerId} not found`,
          });
        }
        await consumer.resume();
        console.log(`Consumer ${consumer.id} resumed successfully`);
        // Acknowledge success to the client
        callback({ resumed: true });
      } catch (error) {
        console.error(`Error resuming consumer ${consumerId}:`, error);
        // Pass the error message back to the client
        callback({ error: error.message || 'Failed to resume consumer' });
      }
    });

    socket.on('disconnect', () => {
      // do cleanup
      console.log('User got disconnected', socket.id);
      peers
        .get(socket.id)
        ?.tranports.forEach((transport: Transport) => transport.close());

      peers.delete(socket.id);
    });
  });

  httpServer.listen(8080, () => {
    console.log('Server is running on port 8080');
  });
})();
