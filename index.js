import { DNSServer, Record } from 'udns.js'

const server = new DNSServer()

server.onrequest = (packet) => {
	console.log('Got DNS request with questions: ', packet.questions.map(q => q.name))
	for(const {name} of packet.questions){
		// Alternatively supply an integer (e.g const answer = 0x01020304)
		const answer = '1.2.3.4'
		console.log('Responding to', name, 'with', answer)
		packet.answers.push(Record.A(name, answer))
	}
}
await server.listen(53)
console.log('DNS server listening on port 53')