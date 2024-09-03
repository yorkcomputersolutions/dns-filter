import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'url';
import path from 'path';
import { dirname } from 'path';
import dotenv from 'dotenv';

// Load the .env config
dotenv.config();

// Get the current directory equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const server = Fastify({ logger: true });

// Register the static plugin to serve files from the "public" directory
server.register(fastifyStatic, {
    root: path.join(__dirname, 'public'), // Serve files from the "public" directory
    prefix: '/', // Serve from the root URL
});

// Define the route for the block page
server.get('/', (request, reply) => {
    // Send the index.html file located in the "public" folder
    reply.sendFile('blocked.html'); 
});

// Start the Fastify server
try {
    await server.listen({ port: process.env.PAGE_SERVER_PORT })
} catch (err) {
    server.log.error(err)
    process.exit(1)
}

