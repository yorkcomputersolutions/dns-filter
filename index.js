import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path, { dirname } from 'path';
import dotenv from 'dotenv';
import DNS2 from 'dns2'; // Import Packet from dns2
import fs from 'fs';

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

console.log('SPAWNING ', serverPath);

// Spawn a child process to start the Fastify server
const serverProcess = spawn(process.env.NODE_PATH, [serverPath], {
    stdio: 'inherit'
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
        const data = fs.readFileSync(filePath, 'utf-8');
        const blockedDomains = data
            .split('\n')
            .map((domain) => domain.trim())
            .filter((domain) => domain.length > 0);
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
    handle: async (request, send, rinfo) => {
        console.log(`Received query from ${rinfo.address}:${rinfo.port}`);

        let response = DNS2.Packet.createResponseFromRequest(request);
        const [question] = request.questions;
        const { name } = question;

        console.log(`Received DNS request for ${name}`);

        // Routing logic
        if (blockedDomains.includes(name)) {
            console.log(`Blocking domain ${name}`);
            response.answers.push({
                name,
                type: DNS2.Packet.TYPE.A,
                class: DNS2.Packet.CLASS.IN,
                ttl: 300,
                address: '0.0.0.0', // Blocked address
            });
            send(response); // Send the blocked response
        } else {
            // Forward unresolved queries to an upstream DNS server
            try {
                const upstreamResponse = await forwardQueryToUpstream(request);
                response = DNS2.Packet.createResponseFromRequest(request);
                response.answers = upstreamResponse.answers;
            } catch (error) {
                console.error(`Error forwarding query to upstream DNS: ${error.message}`);
                response.answers.push({
                    name,
                    type: DNS2.Packet.TYPE.A,
                    class: DNS2.Packet.CLASS.IN,
                    ttl: 300,
                    address: '0.0.0.0', // Default response
                });
            }
            send(response); // Send the response
        }
    }
});

// Function to forward DNS queries to the upstream DNS server
async function forwardQueryToUpstream(request) {
    const { Packet } = DNS2;
    const packet = Packet.createRequest(request);
    const upstreamDns = process.env.UPSTREAM_DNS_SERVER || '1.1.1.1';
    const response = await Packet.send({
        address: upstreamDns,
        port: 53,
        packet,
    });

    return Packet.parse(response);
}

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
        type: 'udp4',
    },
    tcp: {
        port: dnsPort,
        address: process.env.DNS_SERVER_ADDRESS || '127.0.0.1',
    },
});
