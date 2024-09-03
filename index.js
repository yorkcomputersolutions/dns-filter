import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path, { dirname } from 'path';
import dotenv from 'dotenv';
import DNS2 from 'dns2'; // Import Packet from dns2
import fs from 'fs';
import Fastify from 'fastify';
import { Buffer } from 'buffer';

// Load the .env config
dotenv.config();

// Get the current directory equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * START THE PAGE SERVER
 */
// Define the path to the Fastify server script
const serverPath = path.join(__dirname, 'page-server.js');

// Spawn a child process to start the Fastify server
const serverProcess = spawn(process.env.NODE_PATH, [serverPath], {
    stdio: 'inherit', // Inherit stdio so output is visible in the main console,
    gid: 0,
    uid: 0
});

// Listen for errors from the Fastify server process
serverProcess.on('error', (err) => {
    console.error('Failed to start Fastify server:', err);
});

// Handle exit events from the child process
serverProcess.on('exit', (code, signal) => {
    console.log(`DNS server process exited with code ${code} and signal ${signal}`);
});

// Handle termination signals
const shutdown = () => {
    console.log('Shutting down...');
    serverProcess.kill('SIGTERM'); // Send termination signal to child process
    process.exit(0); // Exit the main process
};

// Listen for termination signals
process.on('SIGINT', shutdown); // Ctrl+C
process.on('SIGTERM', shutdown); // kill command

// Path to the blockedDomains.txt file
const filePath = path.join(__dirname, 'data', 'blocked-domains.txt');

// Function to load blocked domains from the file
const loadBlockedDomains = () => {
    try {
        // Read the file synchronously; alternatively, you can use fs.promises.readFile for async
        const data = fs.readFileSync(filePath, 'utf-8');

        // Split by newline and filter out empty lines
        const blockedDomains = data
            .split('\n')
            .map((domain) => domain.trim()) // Remove whitespace from each domain
            .filter((domain) => domain.length > 0); // Exclude empty lines

        return blockedDomains;
    } catch (error) {
        console.error('Error reading blockedDomains file:', error);
        return [];
    }
};

// Load the domains
const blockedDomains = loadBlockedDomains();

/**
 * START THE DNS SERVER AND ENGINE
 */
const server = DNS2.createServer({
    udp: true,
    tcp: true,
    doh: false,
    handle: (request, send, rinfo) => {
        let response = DNS2.Packet.createResponseFromRequest(request);
        const [question] = request.questions;
        const {
            name
        } = question;
    
        console.log(`Received DNS request for ${name}`);
    
        // Routing logic
        if (blockedDomains.includes(name)) {
            console.log(`Blocking domain ${name}`);
    
            response.answers.push({
                name,
                type: DNS2.Packet.TYPE.A,
                class: DNS2.Packet.CLASS.IN,
                ttl: 300,
                address: process.env.DNS_SERVER_ADDRESS || '127.0.0.1',
            });
            send(response); // Send the blocked response
        } else {
            // Forward unresolved queries to an upstream DNS server
            try {
                response = DNS2.Packet.createResponseFromRequest(request);
                send(response);
            } catch (error) {
                console.error(`Error forwarding query to upstream DNS: ${error.message}`);
                response.answers.push({
                    name,
                    type: DNS2.Packet.TYPE.A,
                    class: DNS2.Packet.CLASS.IN,
                    ttl: 300,
                    address: '1.1.1.1',
                });
                send(response); // Send the SERVFAIL response
            }
        }

    }
});

// Set the upstream DNS server to forward unresolved queries
const upstreamDns = '1.1.1.1';

// Handle incoming DNS requests
server.on('request', async (request, response, rinfo) => {

});

// Start the DNS server on port 53 (standard DNS port)
const dnsPort = process.env.DNS_SERVER_PORT || 53;

server.on('requestError', (error) => {
    console.log('Client sent an invalid request', error);
});

server.on('listening', () => {
    console.log(`DNS server is running on port ${dnsPort}`);
    console.log(server.addresses());
});

server.on('close', () => {
    console.log('Server closed');
});

server.listen({
    udp: {
        port: dnsPort,
        address: process.env.DNS_SERVER_ADDRESS || '127.0.0.1',
        type: 'udp4', // IPv4 or IPv6 (Must be either "udp4" or "udp6")
    },
    tcp: {
        port: dnsPort,
        address: process.env.DNS_SERVER_ADDRESS || '127.0.0.1',
    },
});
