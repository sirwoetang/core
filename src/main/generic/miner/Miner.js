class Miner extends Observable {
	constructor(blockchain, mempool, minerAddress) {
		super();
		this._blockchain = blockchain;
		this._mempool = mempool;

		// XXX Cleanup
		this._address = minerAddress || new Address();
		if (!minerAddress || !(minerAddress instanceof Address)) {
			console.warn('No miner address set');
		}

		// The webworker instance doing all the heavy lifting.
		this._worker = null;

		// The rate the worker is hashing at.
		this._hashrate = 0;

		// The block we are currently mining on.
		this._block = null;

		// Listen to changes in the mempool which evicts invalid transactions
		// after every blockchain head change and then fires 'transactions-ready'
		// when the eviction process finishes. Restart work on the next block
		// with fresh transactions when this fires.
		this._mempool.on('transactions-ready', () => this._startWork());

		// Immediately start processing transactions when they come in.
		this._mempool.on('transaction-added', () => this._startWork());
	}

	startWork() {
		if (this.working) {
			console.warn('Miner already working');
			return;
		}

		// Initialize the webworker that is going to do the actual mining.
		this._worker = this._createWorker();
		this._worker.onmessage = msg => this._onMessage(msg.data);

		// Tell listeners that we've started working.
		this.fire('start', this);

		// Kick off the mining process.
		this._startWork();
	}

	stopWork() {
		if (this._worker) {
			this._worker.terminate();
			this._worker = null;
		}

		this._hashrate = 0;

		console.log('Miner stopped work');

		// Tell listeners that we've stopped working.
		this.fire('stop', this);
	}


	async _startWork() {
		// XXX Needed as long as we cannot unregister from transactions-ready/added events.
		if (!this.working) return;

		// Construct next block.
		this._block = await this._getNextBlock();

		console.log('Miner starting work on prevHash=' + this._block.prevHash.toBase64() + ', accountsHash=' + this._block.accountsHash.toBase64() + ', difficulty=' + this._block.difficulty + ', transactionCount=' + this._block.transactionCount + ', hashrate=' + this._hashrate + ' H/s');

		// Tell the worker to start hashing.
		this._worker.postMessage(this._block.header);
	}

	_createWorker() {
		// Create the source code of the worker.
		const source = new WorkerBuilder()
			.add(BufferUtils)
			.add(SerialBuffer)
			.add(ObjectUtils)
			.add(CryptoLib)
			.add(Crypto)
			.add(Primitive)
			.add(Hash)
			.add(BlockHeader)
			.add(MiningWorker)
			.main(Miner._workerMain)
			.build();

		// Put it into a blob.
		// TODO Blob backwards compatbility (BlobBuilder)
		const blob = new Blob([source], {type: 'application/javascript'});

		// Create a object url for the blob.
		const objUrl = (window.URL ? URL : webkitURL).createObjectURL(blob);

		// Create the webworker.
		return new Worker(objUrl);
	}

	static _workerMain() {
		const self = this;
		MiningWorker.init(self);
	}

	async _onMessage(msg) {
		// We expect two types of messages from the worker:
		// - nonce: The worker has found a valid nonce for the current block.
		// - hashrate: The worker is reporting its hashrate.

		// Nonce
		if (msg.nonce !== undefined) {
			// Set the nonce in the current block header.
			this._block.header.nonce = msg.nonce;

			// Report our great success.
			const hash = await this._block.hash();
			console.log('MINED BLOCK!!! nonce=' + this._block.nonce + ', difficulty=' + this._block.difficulty + ', hash=' + hash.toBase64() + ', transactionCount=' + this._block.transactionCount + ', hashrate=' + this._hashrate + ' H/s');

			// Tell listeners that we've mined a block.
			this.fire('block-mined', this._block, this);

			// Push block into blockchain.
			await this._blockchain.pushBlock(this._block);
		}
		// Hashrate
		else if (msg.hashrate !== undefined) {
			this._hashrate = msg.hashrate;
			this.fire('hashrate-changed', this._hashrate, this);
		}
		// Invalid message
		else {
			console.error('Invalid message received from mining worker', msg);
		}
	}

	async _getNextBlock() {
		const body = await this._getNextBody();
		const header = await this._getNextHeader(body);
		return new Block(header, body);
	}

	async _getNextHeader(body) {
		const prevHash = await this._blockchain.headHash;
		const accountsHash = this._blockchain.accountsHash;
		const bodyHash = await body.hash();
		const timestamp = this._getNextTimestamp();
		const difficulty = await this._blockchain.getNextDifficulty();
		const nonce = Math.round(Math.random() * 100000);
		return new BlockHeader(prevHash, bodyHash, accountsHash, difficulty, timestamp, nonce);
	}

	async _getNextBody() {
		// Get transactions from mempool (default is maxCount=5000).
		// TODO Completely fill up the block with transactions until the size limit is reached.
		const transactions = await this._mempool.getTransactions();
		return new BlockBody(this._address, transactions);
	}

	_getNextTimestamp() {
		return Math.floor(Date.now() / 1000);
	}

	get address() {
		return this._address;
	}

	get working() {
		return !!this._worker;
	}

	get hashrate() {
		return this._hashrate;
	}
}
Class.register(Miner);
