class Proofchain extends Observable {
    static getPersistent() {
        const store = ProofchainStore.getPersistent();
        return new Proofchain(store);
    }

    static createVolatile() {
        const store = ProofchainStore.createVolatile();
        return new Proofchain(store);
    }

    constructor(store) {
        super();
        this._store = store;
        this._path = [];
    }

    async init() {
        let current = await this._store.getMainHead();
        while (current) {
            this._path.unshift(await current.hash());
            current = await this._store.get(current.prevHash.toBase64());
        }
    }

    async revert() {
        const currentHead = await this.getMainHead();
        if (!currentHead) return false;
        const prevHead = await this._store.get(currentHead.prevHash.toBase64());
        if (!prevHead) return (await this._store.cleanMainHead()) && false;
        await this._store.setMainHead(prevHead);
        this._path.pop();
        return true;
    }

    getHeader(hash) {
        return this._store.get(hash.toBase64());
    }

    getMainHead() {
        return this._store.getMainHead();
    }

    async restart(header) {
        if (header) {
            // TODO: Clear old entries from store?
            await this._store.put(header);
            await this._store.setMainHead(header);
            this._path = [await header.hash()];
        } else {
            await this._store.cleanMainHead();
            this._path = [];
        }
        this.fire('restarted', header);
    }

    async revertTo(header) {
        const i = this._path.indexOf(await header.hash());
        if (i < 0) return false;
        while (i !== this._path.length) {
            this.revert();
        }
        return true;
    }

    async push(header, allowRestart = false) {
        const currentHead = await this.getMainHead();
        const currentHash = currentHead ? await currentHead.hash() : undefined;
        const headerHash = await header.hash();

        if (this._path.indexOf(headerHash) >= 0) {
            // Already in chain
            return;
        }

        if (!(await this.verifyHeaderIntegrity(header))) throw 'Header is invalid.';

        if (header.prevHash.equals(currentHash)) {
            if (!this.verifyHeaderChainability(header, currentHead)) throw 'Header does not attach to current chain.';
            await this._store.put(header);
            await this._store.setMainHead(header);
            this._path.push(headerHash);
            this.fire('extended', header);
        } else if (currentHead && header.height - 1 <= currentHead.height) {
            throw 'Header should chain up to current chain but does not.';
        } else if (allowRestart) {
            await this._store.put(header);
            await this._store.setMainHead(header);
            this._path = [headerHash];
            this.fire('restarted', header);
        } else {
            throw 'Header does not chain up and allowRestart is not set.';
        }
    }

    async verifyHeaderIntegrity(header) {
        // Verify that the block's timestamp is not too far in the future.
        // TODO Use network-adjusted time (see https://en.bitcoin.it/wiki/Block_timestamp).
        const maxTimestamp = Math.floor((Date.now() + Blockchain.BLOCK_TIMESTAMP_DRIFT_MAX) / 1000);
        if (header.timestamp > maxTimestamp) {
            Log.w(Proofchain, 'Rejected block - timestamp too far in the future');
            return false;
        }

        // Check that the headerHash matches the difficulty.
        if (!(await header.verifyProofOfWork())) {
            Log.w(Proofchain, 'Rejected block - PoW verification failed');
            return false;
        }

        return true;
    }

    async verifyHeaderChainability(header, prev) {
        // Check that the height is one higher than previous
        if (prev.height !== header.height - 1) {
            Log.w(Proofchain, 'Rejecting block - not next in height');
            return false;
        }

        // Check that the difficulty matches.
        if (!this.mayBeNextCompactTarget(prev, header.nBits)) {
            Log.w(Proofchain, 'Rejecting block - difficulty mismatch');
            return false;
        }

        // Check that the timestamp is after (or equal) the previous block's timestamp.
        if (prev.timestamp > header.timestamp) {
            Log.w(Proofchain, 'Rejecting block - timestamp mismatch');
            return false;
        }

        // Everything checks out.
        return true;
    }

    async mayBeNextCompactTarget(prev, nBits) {
        // The difficulty is adjusted every DIFFICULTY_ADJUSTMENT_BLOCKS blocks.
        if (prev.height % Policy.DIFFICULTY_ADJUSTMENT_BLOCKS === 0) {
            // If the given chain is the main chain, get the last DIFFICULTY_ADJUSTMENT_BLOCKS
            // blocks via this._mainChain, otherwise fetch the path.
            const prevHash = await prev.hash();
            const i = this._path.indexOf(prevHash);

            // Blind accept if we don't have enough data.
            if (i < Policy.DIFFICULTY_ADJUSTMENT_BLOCKS) return true;
            let startHash = this._path[i - Policy.DIFFICULTY_ADJUSTMENT_BLOCKS];

            // Compute the actual time it took to mine the last DIFFICULTY_ADJUSTMENT_BLOCKS blocks.
            const startHead = await this._store.get(startHash.toBase64());
            const actualTime = prev.timestamp - startHead.timestamp;

            // Compute the target adjustment factor.
            const expectedTime = Policy.DIFFICULTY_ADJUSTMENT_BLOCKS * Policy.BLOCK_TIME;
            let adjustment = actualTime / expectedTime;

            // Clamp the adjustment factor to [0.25, 4].
            adjustment = Math.max(adjustment, 0.25);
            adjustment = Math.min(adjustment, 4);

            // Compute the next target.
            const currentTarget = prev.target;
            let nextTarget = currentTarget * adjustment;

            // Make sure the target is below or equal the maximum allowed target (difficulty 1).
            // Also enforce a minimum target of 1.
            nextTarget = Math.min(nextTarget, Policy.BLOCK_TARGET_MAX);
            nextTarget = Math.max(nextTarget, 1);

            return BlockUtils.targetToCompact(nextTarget) === nBits;
        }

        // If the difficulty is not adjusted at this height, the next difficulty
        // is the current difficulty.
        return prev.nBits === nBits;
    }

    async pushAll(headers) {
        let i = 0;
        for (; i < headers.length; ++i) {
            if (!this._path.indexOf(await headers[i].hash()) >= 0) break;
        }
        for (; i < headers.length; ++i) {
            await this.push(headers[i], i === 0);
        }
    }

    async getHeight() {
        const head = await this.getMainHead();
        return head ? head.height : undefined;
    }

    get path() {
        return this._path;
    }
}
Class.register(Proofchain);
