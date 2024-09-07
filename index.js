// Import necessary modules
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path, { dirname } from 'path';
import dotenv from 'dotenv';
import dns from 'node-dns'; // Import node-dns
import fs from 'fs';
import Fastify from 'fastify';

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
            .map(domain => domain.trim())
            .filter(domain => domain.length > 0);
        return blockedDomains;
    } catch (error) {
        console.error('Error reading blockedDomains file:', error);
        return [];
    }
};

// Load the domains
const blockedDomains = loadBlockedDomains();

/**
 * START THE DNS SERVER
 */
const dnsServer = dns.createServer();

// Function to handle DNS requests
dnsServer.on('request', (request, response) => {
    console.log(`Received query for ${request.question[0].name}`);

    const domain = request.question[0].name;
    
    if (blockedDomains.includes(domain)) {
        console.log(`Blocking domain ${domain}`);
        response.answer.push({
            name: domain,
            type: dns.consts.NAME_TO_TYPE.A,
            class: dns.consts.CLASS.IN,
            ttl: 300,
            address: process.env.DNS_SERVER_ADDRESS || '127.0.0.1',
        });
        response.send();
    } else {
        // Forward the request to an upstream DNS server
        dns.resolve(domain, (err, answer) => {
            if (err) {
                console.error(`Error resolving domain ${domain}: ${err.message}`);
                response.answer.push({
                    name: domain,
                    type: dns.consts.NAME_TO_TYPE.A,
                    class: dns.consts.CLASS.IN,
                    ttl: 300,
                    address: '1.1.1.1', // Fallback IP address
                });
            } else {
                response.answer = answer;
            }
            response.send();
        });
    }
});

// Start the DNS server on port 53 (standard DNS port)
const dnsPort = process.env.DNS_SERVER_PORT || 53;

dnsServer.on('listening', () => {
    console.log(`DNS server is running on port ${dnsPort}`);
});

dnsServer.on('close', () => {
    console.log('Server closed');
});

// Bind to 0.0.0.0 for all network interfaces
dnsServer.listen({
    udp: {
        port: dnsPort,
        address: '0.0.0.0',
        type: 'udp4', // IPv4
    },
    tcp: {
        port: dnsPort,
        address: '0.0.0.0',
    },
});
