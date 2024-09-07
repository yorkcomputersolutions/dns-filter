import DNS2 from 'dns2';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path, { dirname } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const filePath = path.join(__dirname, 'data', 'blocked-domains.txt');

const loadBlockedDomains = () => {
    try {
        const data = fs.readFileSync(filePath, 'utf-8');
        return data.split('\n').map((domain) => domain.trim()).filter((domain) => domain.length > 0);
    } catch (error) {
        console.error('Error reading blockedDomains file:', error);
        return [];
    }
};

const blockedDomains = loadBlockedDomains();

const server = DNS2.createServer({
    udp: true,
    tcp: true,
    handle: async (request, send, rinfo) => {
        console.log(`Received query from ${rinfo.address}:${rinfo.port}`);
        
        const response = DNS2.Packet.createResponseFromRequest(request);
        const [question] = request.questions;
        const { name } = question;

        console.log(`Received DNS request for ${name}`);

        if (blockedDomains.includes(name)) {
            console.log(`Blocking domain ${name}`);
            response.answers.push({
                name,
                type: DNS2.Packet.TYPE.A,
                class: DNS2.Packet.CLASS.IN,
                ttl: 300,
                address: '0.0.0.0', // Blocked address
            });
            send(response);
        } else {
            try {
                const upstreamResponse = await forwardQueryToUpstream(request);
                response.answers = upstreamResponse.answers;
                send(response);
            } catch (error) {
                console.error(`Error forwarding query to upstream DNS: ${error.message}`);
                response.answers.push({
                    name,
                    type: DNS2.Packet.TYPE.A,
                    class: DNS2.Packet.CLASS.IN,
                    ttl: 300,
                    address: '0.0.0.0',
                });
                send(response);
            }
        }
    }
});

async function forwardQueryToUpstream(request) {
    const { Packet } = DNS2;
    const packet = Packet.createRequest(request);
    const upstreamDns = process.env.UPSTREAM_DNS_SERVER || '1.1.1.1';

    return new Promise((resolve, reject) => {
        const client = dgram.createSocket('udp4');
        const port = 53;

        client.on('message', (msg) => {
            client.close();
            resolve(Packet.parse(msg));
        });

        client.on('error', (err) => {
            client.close();
            reject(err);
        });

        client.send(packet, 0, packet.length, port, upstreamDns, (err) => {
            if (err) {
                client.close();
                reject(err);
            }
        });
    });
}

const dnsPort = process.env.DNS_SERVER_PORT || 53;

server.on('requestError', (error) => {
    console.log('Client sent an invalid request', error);
});

server.on('listening', () => {
    console.log(`DNS server is running on port ${dnsPort}`);
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
