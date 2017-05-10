class MiningWorker {
    static init(self) {
        if (MiningWorker._instance) return;
        MiningWorker._instance = new MiningWorker(self);
    }

    constructor(self) {
        this._self = self;
        this._self.onmessage = msg => this._onMessage(msg.data);

        // The timeout we use to yield control flow every now and then to process new messages.
        this._timeout = null;

        // Initialize hashrate computation.
		this._hashCount = 0;
        this._lastHashrate = Date.now();
        this._self.setInterval( () => this._updateHashrate(), 5000);
    }

    _onMessage(msg) {
        const header = BlockHeader.cast(msg);
        this._buffer = header.serialize();
        this._nonce =  header.nonce;
        this._difficulty = header.difficulty;

        if (this._timeout) {
            this._self.clearTimeout(this._timeout);
        }

        this._tryNoncesClosure = this._tryNonces.bind(this);
        this._tryNonces();
    }

    async _tryNonces() {
        // Play with the number of iterations to adjust hashrate vs. responsiveness.
        for (let i = 0; i < 100000; ++i) {
            const hash = await Crypto.sha256(this._buffer);
            this._hashCount++;

            if (BlockHeader.isProofOfWork(hash, this._difficulty)) {
                this._self.postMessage({nonce: this._nonce});

                // We will resume work when the blockchain updates.
                return;
            }

            this._nonce++;
            BlockHeader.setNonce(this._buffer, this._nonce);
        }

        this._timeout = this._self.setTimeout(this._tryNoncesClosure, 0);
    }

	_updateHashrate() {
		const elapsed = (Date.now() - this._lastHashrate) / 1000;
		const hashrate = Math.round(this._hashCount / elapsed);

        this._lastHashrate = Date.now();
		this._hashCount = 0;

        // Report hashrate back to main thread.
        this._self.postMessage({hashrate: hashrate});
	}
}
MiningWorker._instance = null;
