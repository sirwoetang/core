class ConsensusAgent extends Observable {
    constructor(blockchain, mempool, peer, behavior) {
        super();
        this._blockchain = blockchain;
        this._mempool = mempool;
        this._peer = peer;
        this._behavior = behavior;

        // Flag indicating that we are currently syncing our blockchain with the peer's.
        this._syncing = false;

        // Flag indicating that have synced our blockchain with the peer's.
        this._synced = false;

        // The height of our blockchain when we last attempted to sync the chain.
        this._lastChainHeight = 0;

        // Number of blocks received from this peer.
        this._blocksReceived = 0;

        // The number of failed blockchain sync attempts.
        this._failedSyncs = 0;

        // Set of all objects (InvVectors) that we think the remote peer knows.
        this._knownObjects = new HashSet();

        // InvVectors we want to request via getdata are collected here and
        // periodically requested.
        this._objectsToRequest = new IndexedArray([], true);

        // Objects that are currently being requested from the peer.
        this._objectsInFlight = null;

        // Helper object to keep track of timeouts & intervals.
        this._timers = new Timers();

        // Listen to consensus messages from the peer.
        peer.channel.on('inv', msg => this._onInv(msg));
        peer.channel.on('getdata', msg => this._onGetData(msg));
        peer.channel.on('notfound', msg => this._onNotFound(msg));
        peer.channel.on('block', msg => this._onBlock(msg));
        peer.channel.on('tx', msg => this._onTx(msg));
        peer.channel.on('headers', msg => this._onHeaders(msg));
        peer.channel.on('getblocks', msg => this._onGetBlocks(msg));
        peer.channel.on('getheaders', msg => this._onGetHeaders(msg));
        peer.channel.on('mempool', msg => this._onMempool(msg));
        peer.channel.on('getaccounts', msg => this._onGetAccounts(msg));
        peer.channel.on('accounts', msg => this._onAccounts(msg));

        // Clean up when the peer disconnects.
        peer.channel.on('close', () => this._onClose());

        // Wait for the blockchain to processes queued blocks before requesting more.
        this._blockchain.on('ready', () => {
            if (this._syncing) this.syncBlockchain();
        });
    }

    /* Public API */

    async relayBlock(block) {
        // Don't relay if no consensus established yet.
        if (!this._synced) {
            return;
        }

        // Create InvVector.
        const hash = await block.hash();
        const vector = new InvVector(InvVector.Type.BLOCK, hash);

        // Don't relay block to this peer if it already knows it.
        if (this._knownObjects.contains(vector)) {
            return;
        }

        // TODO: Also report all the new balances?

        // Relay block to peer.
        this._peer.channel.inv([vector]);

        // Assume that the peer knows this block now.
        this._knownObjects.add(vector);
    }

    async relayTransaction(transaction) {
        // TODO Don't relay if no consensus established yet ???

        // Create InvVector.
        const hash = await transaction.hash();
        const vector = new InvVector(InvVector.Type.TRANSACTION, hash);

        // Don't relay transaction to this peer if it already knows it.
        if (this._knownObjects.contains(vector)) {
            return;
        }

        // Relay transaction to peer.
        this._peer.channel.inv([vector]);

        // Assume that the peer knows this transaction now.
        this._knownObjects.add(vector);
    }

    syncBlockchain() {
        this._syncing = true;

        // If the blockchain is still busy processing blocks, wait for it to catch up.
        if (this._blockchain.busy) {
            Log.v(ConsensusAgent, 'Blockchain busy, waiting ...');
        }
        // If we already requested blocks from the peer but it didn't give us any
        // good ones, retry or drop the peer.
        else if (this._lastChainHeight === this._blockchain.height) {
            this._failedSyncs++;
            if (this._failedSyncs < ConsensusAgent.MAX_SYNC_ATTEMPTS) {
                this._request();
            } else {
                this._peer.channel.ban('blockchain sync failed');
            }
        }
        // If the peer has a longer chain than us, request blocks from it.
        else if (this._blockchain.height < this._peer.startHeight) {
            this._lastChainHeight = this._blockchain.height;
            this._request();
        }
        // The peer has a shorter chain than us.
        // TODO what do we do here?
        else if (this._blockchain.height > this._peer.startHeight) {
            Log.v(ConsensusAgent, `Peer ${this._peer.peerAddress} has a shorter chain (${this._peer.startHeight}) than us`);

            // XXX assume consensus state?
            this._syncing = false;
            this._synced = true;
            this.fire('sync');
        }
        // We have the same chain height as the peer, but we need to sync the accounts next (mini BC client).
        else if (this._behavior === Core.Behavior.Mini) {
            this._requestAccounts();
        }
        // We have the same chain height as the peer.
        // TODO Do we need to check that we have the same head???
        else {
            // Consensus established.
            this._syncing = false;
            this._synced = true;
            this.fire('sync');
        }
    }

    _request() {
        if (this._behavior === Core.Behavior.Full) {
            this._requestBlocks();
        } else if (this._behavior === Core.Behavior.Mini) {
            // Current behavior: Download 500 latest headers. Verify PoW.
            // TODO: To make sure we have the proof chain with the best total difficulty, receive proof chain from multiple nodes and rebranch if necessary (not yet implemented though, should probably go into the push function in proof chain).
            this._requestHeaders();
        }
    }

    async _requestAccounts() {
        // XXX Only one getaccounts request at a time.
        if (this._timers.timeoutExists('getaccounts')) {
            Log.e(ConsensusAgent, 'Duplicate _requestAccounts()');
            return;
        }

        const slices = await this._blockchain.getUsedAddresses();
        this._peer.channel.getaccounts(slices);

        this._timers.setTimeout('getaccounts', () => {
            this._timers.clearTimeout('getaccounts');
            this._peer.channel.close('getaccounts timeout');
        }, ConsensusAgent.REQUEST_TIMEOUT);
    }

    async _requestHeaders() {
        // XXX Only one getheaders request at a time.
        if (this._timers.timeoutExists('getheaders')) {
            Log.e(ConsensusAgent, 'Duplicate _requestHeaders()');
            return;
        }

        const hashes = [];
        let step = 1;
        for (let i = await this._blockchain.proofchain.getHeight() - 1; i > 0; i -= step) {
            // Push top 10 hashes first, then back off exponentially.
            if (hashes.length >= 10) {
                step *= 2;
            }
            const hash = this._blockchain.proofchain.path[i];
            if (hash) hashes.push(hash);
        }

        // Push the genesis block hash.
        hashes.push(Block.GENESIS.HASH);

        // Request blocks from peer.
        this._peer.channel.getheaders(hashes, Hash.NULL, 500, true);

        this._timers.setTimeout('getheaders', () => {
            this._timers.clearTimeout('getheaders');
            this._peer.channel.close('getheaders timeout');
        }, ConsensusAgent.REQUEST_TIMEOUT);
    }

    _requestBlocks() {
        // XXX Only one getblocks request at a time.
        if (this._timers.timeoutExists('getblocks')) {
            Log.e(ConsensusAgent, 'Duplicate _requestBlocks()');
            return;
        }

        // Request blocks starting from our hardest chain head going back to
        // the genesis block. Space out blocks more when getting closer to the
        // genesis block.
        const hashes = [];
        let step = 1;
        for (let i = this._blockchain.height - 1; i > 0; i -= step) {
            // Push top 10 hashes first, then back off exponentially.
            if (hashes.length >= 10) {
                step *= 2;
            }
            hashes.push(this._blockchain.path[i]);
        }

        // Push the genesis block hash.
        hashes.push(Block.GENESIS.HASH);

        // Request blocks from peer.
        this._peer.channel.getblocks(hashes);

        // Drop the peer if it doesn't start sending InvVectors for its chain within the timeout.
        // TODO should we ban here instead?
        this._timers.setTimeout('getblocks', () => {
            this._timers.clearTimeout('getblocks');
            this._peer.channel.close('getblocks timeout');
        }, ConsensusAgent.REQUEST_TIMEOUT);
    }

    async _requestObjects(vectors) {
        // Keep track of the objects the peer knows.
        for (const vector of vectors) {
            this._knownObjects.add(vector);
        }

        // Check which of the advertised objects we know
        // Request unknown objects, ignore known ones.
        const unknownObjects = [];
        for (const vector of vectors) {
            switch (vector.type) {
                case InvVector.Type.BLOCK: {
                    const block = await this._blockchain.getBlock(vector.hash); // eslint-disable-line no-await-in-loop
                    if (!block) {
                        unknownObjects.push(vector);
                    }
                    break;
                }
                case InvVector.Type.TRANSACTION: {
                    const tx = await this._mempool.getTransaction(vector.hash); // eslint-disable-line no-await-in-loop
                    if (!tx) {
                        unknownObjects.push(vector);
                    }
                    break;
                }
                default:
                    throw `Invalid inventory type: ${vector.type}`;
            }
        }

        if (unknownObjects.length > 0) {
            // Store unknown vectors in objectsToRequest array.
            for (const obj of unknownObjects) {
                this._objectsToRequest.push(obj);
            }

            // Clear the request throttle timeout.
            this._timers.clearTimeout('inv');

            // If there are enough objects queued up, send out a getdata request.
            if (this._objectsToRequest.length >= ConsensusAgent.REQUEST_THRESHOLD) {
                this._requestData();
            }
            // Otherwise, wait a short time for more inv messages to arrive, then request.
            else {
                this._timers.setTimeout('inv', () => this._requestData(), ConsensusAgent.REQUEST_THROTTLE);
            }
        } else {
            // XXX The peer is weird. Give him another chance.
            this._noMoreData();
        }
    }

    async _onInv(msg) {
        // Clear the getblocks timeout.
        this._timers.clearTimeout('getblocks');

        Log.v(ConsensusAgent, `[INV] ${msg.vectors.length} vectors received from ${this._peer.peerAddress}`);

        this._requestObjects(msg.vectors);
    }

    async _onHeaders(msg) {
        this._timers.clearTimeout('getheaders');
        // TODO XXX
        try {
            const proofchain = await Proofchain.createVolatile();
            await proofchain.pushAll(msg.headers);

            // If it would be bad it had failed here.
            await this._blockchain.proofchain.pushAll(msg.headers);

            // Next, request blocks for the most recent headers.
            const startIndex = Math.max(0, msg.headers.length - ConsensusAgent.NUM_BLOCKS_VERIFY_MINI);
            let objectsToRequest = [];
            for (let i=startIndex; i<msg.headers.length; ++i) {
                const blockHash = await msg.headers[i].hash();
                // Request those blocks we do not know.
                if (!(await this._blockchain.getBlock(blockHash))) {
                    objectsToRequest.push(new InvVector(InvVector.Type.BLOCK, blockHash));
                }
            }
            this._requestObjects(objectsToRequest);
        } catch (e) {
            Log.d(e);
            this._peer.channel.ban('received invalid headers');
            return;
        }
    }

    async _onAccounts(msg) {
        this._timers.clearTimeout('getaccounts');
        // If we could not populate our accounts tree, maybe a new block was mined.
        if (!(await this._blockchain.populateAccountsTree(msg.nodes))) {
            Log.d(ConsensusAgent, 'Failed to populate accounts tree');
            // TODO What should we do in this case?
            return;
        }

        // Verify block history by taking current accounts tree
        // and reverting it back to the first block we retrieved.
        const tmpAccounts = await this._blockchain.createTemporaryAccounts();
        let head = await this._blockchain.head.hash();
        let accountsHash = await tmpAccounts.hash();
        // Iterate over all blocks in reverse.
        // Do ConsensusAgent.NUM_BLOCKS_VERIFY_MINI+1 runs to verify all ConsensusAgent.NUM_BLOCKS_VERIFY_MINI blocks.
        for (let i=0; i<ConsensusAgent.NUM_BLOCKS_VERIFY_MINI; ++i) {
            const block = await this._blockchain.getBlock(head); // eslint-disable-line no-await-in-loop

            // Check that the accountsHashes are correct. Remember that the block contains the accounts hash before reverting it.
            if (!accountsHash.equals(block.accountsHash)) {
                Log.d(ConsensusAgent, 'Failed to validate received blocks - reverting accounts yielded different hash');
                this._peer.channel.ban('received invalid accounts or block');
                return;
            }

            await tmpAccounts.revertBlock(block); // eslint-disable-line no-await-in-loop
            accountsHash = await tmpAccounts.hash(); // eslint-disable-line no-await-in-loop
            head = block.prevHash;
        }

        // Mark as synced!
        // Consensus established.
        this._syncing = false;
        this._synced = true;
        this.fire('sync');
    }

    _requestData() {
        // Only one request at a time.
        if (this._objectsInFlight) return;

        // Don't do anything if there are no objects queued to request.
        if (this._objectsToRequest.isEmpty()) return;

        // Mark the requested objects as in-flight.
        this._objectsInFlight = this._objectsToRequest;

        // Request all queued objects from the peer.
        // TODO depending in the REQUEST_THRESHOLD, we might need to split up
        // the getdata request into multiple ones.
        this._peer.channel.getdata(this._objectsToRequest.array);

        // Reset the queue.
        this._objectsToRequest = new IndexedArray([], true);

        // Set timer to detect end of request / missing objects
        this._timers.setTimeout('getdata', () => this._noMoreData(), ConsensusAgent.REQUEST_TIMEOUT);
    }

    _noMoreData() {
        // Cancel the request timeout timer.
        this._timers.clearTimeout('getdata');

        // Reset objects in flight.
        this._objectsInFlight = null;

        // If there are more objects to request, request them.
        if (!this._objectsToRequest.isEmpty()) {
            this._requestData();
        }
        // Otherwise, request more blocks if we are still syncing the blockchain.
        else if (this._syncing) {
            this.syncBlockchain();
        }
    }

    async _onBlock(msg) {
        const hash = await msg.block.hash();

        // Check if we have requested this block.
        const vector = new InvVector(InvVector.Type.BLOCK, hash);
        if (!this._objectsInFlight || this._objectsInFlight.indexOf(vector) < 0) {
            Log.w(ConsensusAgent, `Unsolicited block ${hash} received from ${this._peer.peerAddress}, discarding`);
            // TODO What should happen here? ban? drop connection?
            // Might not be unsolicited but just arrive after our timeout has triggered.
            return;
        }

        // Increase number of received blocks.
        this._blocksReceived++;

        // Mark object as received.
        this._onObjectReceived(vector);

        let status;
        // If this is the first block in the mini BC client, restart chain here!
        if (this._syncing && this._behavior === Core.Behavior.Mini && this._blocksReceived === 1) {
            status = await this._blockchain.resetTo(msg.block);
        } else {
            // Put block into blockchain.
            status = await this._blockchain.pushBlock(msg.block, this._behavior === Core.Behavior.Full || !this._syncing);
        }

        // TODO send reject message if we don't like the block
        if (status === Blockchain.PUSH_ERR_INVALID_BLOCK) {
            this._peer.channel.ban('received invalid block');
        }
    }

    async _onTx(msg) {
        const hash = await msg.transaction.hash();
        Log.i(ConsensusAgent, `[TX] Received transaction ${hash} from ${this._peer.peerAddress}`);

        // Check if we have requested this transaction.
        const vector = new InvVector(InvVector.Type.TRANSACTION, hash);
        if (!this._objectsInFlight || this._objectsInFlight.indexOf(vector) < 0) {
            Log.w(ConsensusAgent, `Unsolicited transaction ${hash} received from ${this._peer.peerAddress}, discarding`);
            return;
        }

        // Mark object as received.
        this._onObjectReceived(vector);

        // Put transaction into mempool.
        this._mempool.pushTransaction(msg.transaction);

        // TODO send reject message if we don't like the transaction
        // TODO what to do if the peer keeps sending invalid transactions?
    }

    _onNotFound(msg) {
        Log.d(ConsensusAgent, `[NOTFOUND] ${msg.vectors.length} unknown objects received from ${this._peer.peerAddress}`);

        // Remove unknown objects from in-flight list.
        for (const vector of msg.vectors) {
            if (!this._objectsInFlight || this._objectsInFlight.indexOf(vector) < 0) {
                Log.w(ConsensusAgent, `Unsolicited notfound vector received from ${this._peer.peerAddress}, discarding`);
                continue;
            }

            this._onObjectReceived(vector);
        }
    }

    _onObjectReceived(vector) {
        if (!this._objectsInFlight) return;

        // Remove the vector from the objectsInFlight.
        this._objectsInFlight.remove(vector);

        // Reset the request timeout if we expect more objects to come.
        if (!this._objectsInFlight.isEmpty()) {
            this._timers.resetTimeout('getdata', () => this._noMoreData(), ConsensusAgent.REQUEST_TIMEOUT);
        } else {
            this._noMoreData();
        }
    }


    /* Request endpoints */

    async _onGetData(msg) {
        // Keep track of the objects the peer knows.
        for (const vector of msg.vectors) {
            this._knownObjects.add(vector);
        }

        // Check which of the requested objects we know.
        // Send back all known objects.
        // Send notfound for unknown objects.
        const unknownObjects = [];
        for (const vector of msg.vectors) {
            switch (vector.type) {
                case InvVector.Type.BLOCK: {
                    const block = await this._blockchain.getBlock(vector.hash);
                    if (block) {
                        // We have found a requested block, send it back to the sender.
                        this._peer.channel.block(block);
                    } else {
                        // Requested block is unknown.
                        unknownObjects.push(vector);
                    }
                    break;
                }
                case InvVector.Type.TRANSACTION: {
                    const tx = await this._mempool.getTransaction(vector.hash);
                    if (tx) {
                        // We have found a requested transaction, send it back to the sender.
                        this._peer.channel.tx(tx);
                    } else {
                        // Requested transaction is unknown.
                        unknownObjects.push(vector);
                    }
                    break;
                }
                default:
                    throw `Invalid inventory type: ${vector.type}`;
            }
        }

        // Report any unknown objects back to the sender.
        if (unknownObjects.length) {
            this._peer.channel.notfound(unknownObjects);
        }
    }

    async _onGetBlocks(msg) {
        Log.v(ConsensusAgent, `[GETBLOCKS] ${msg.hashes.length} block locators received from ${this._peer.peerAddress}`);

        // A peer has requested blocks. Check all requested block locator hashes
        // in the given order and pick the first hash that is found on our main
        // chain, ignore the rest. If none of the requested hashes is found,
        // pick the genesis block hash. Send the main chain starting from the
        // picked hash back to the peer.
        const mainPath = this._blockchain.path;
        const hashStopIndex = mainPath.indexOf(msg.hashStop);
        let startIndex = -1;

        for (const hash of msg.hashes) {
            // Shortcut for genesis block which will be the only block sent by
            // fresh peers.
            if (Block.GENESIS.HASH.equals(hash)) {
                startIndex = 0;
                break;
            }

            // Check if we know the requested block.
            const block = await this._blockchain.getBlock(hash);

            // If we don't know the block, try the next one.
            if (!block) continue;

            // If the block is not on our main chain, try the next one.
            // mainPath is an IndexedArray with constant-time .indexOf()
            startIndex = mainPath.indexOf(hash);
            if (startIndex < 0) continue;

            // We found a block, ignore remaining block locator hashes.
            break;
        }

        // If we found none of the requested blocks on our main chain,
        // start with the genesis block.
        if (startIndex < 0) {
            // XXX Assert that the full path back to genesis is available in
            // blockchain.path. When the chain grows very long, it makes no
            // sense to keep the full path in memory.
            if (this._blockchain.path.length !== this._blockchain.height) {
                throw 'Blockchain.path.length != Blockchain.height';
            }

            startIndex = 0;
        }

        // Collect up to GETBLOCKS_VECTORS_MAX inventory vectors for the blocks starting right
        // after the identified block on the main chain.
        const stopIndex = Math.min(hashStopIndex > 0 ? hashStopIndex : (mainPath.length - 1), startIndex + ConsensusAgent.GETBLOCKS_VECTORS_MAX);
        const vectors = [];
        for (let i = startIndex + 1; i <= stopIndex; ++i) {
            vectors.push(new InvVector(InvVector.Type.BLOCK, mainPath[i]));
        }

        // Send the vectors back to the requesting peer.
        this._peer.channel.inv(vectors);
    }

    async _onGetHeaders(msg) {
        Log.v(ConsensusAgent, `[GETHEADERS] ${msg.hashes.length} block locators received from ${this._peer.peerAddress}`);

        const mainPath = this._blockchain.proofchain.path;
        const hashStopIndex = mainPath.indexOf(msg.hashStop);
        let startIndex = -1;

        for (const hash of msg.hashes) {
            // Shortcut for genesis block which will be the only block sent by
            // fresh peers.
            if (Block.GENESIS.HASH.equals(hash)) {
                startIndex = 0;
                break;
            }

            // Check if we know the requested header.
            const header = await this._blockchain.getHeader(hash);

            // If we don't know the block, try the next one.
            if (!header) continue;

            // If the block is not on our main chain, try the next one.
            // mainPath is an IndexedArray with constant-time .indexOf()
            startIndex = mainPath.indexOf(hash);
            if (startIndex < 0) continue;

            // We found a block, ignore remaining block locator hashes.
            break;
        }

        let stopIndex;
        if (msg.reverseDirection) {
            stopIndex = hashStopIndex > 0 ? hashStopIndex : (mainPath.length - 1);
            startIndex = Math.max(startIndex, stopIndex - msg.maxNum);
        } else {
            stopIndex = Math.min(hashStopIndex > 0 ? hashStopIndex : (mainPath.length - 1), startIndex + msg.maxNum);
        }

        const headers = [];
        for (let i = startIndex + 1; i <= stopIndex; ++i) {
            const header = await this._blockchain.getHeader(mainPath[i]);
            if (header) headers.push(header);
        }

        this._peer.channel.headers(headers);
    }

    async _onMempool(msg) {
        // Query mempool for transactions
        const transactions = await this._mempool.getTransactions();

        // Send transactions back to sender.
        for (const tx of transactions) {
            this._peer.channel.tx(tx);
        }
    }

    async _onGetAccounts(msg) {
        Log.v(ConsensusAgent, `[GETACCOUNTS] ${msg.addresses.length} accounts slices requested from ${this._peer.peerAddress}`);
        const multi = await this._blockchain.getAccountSlices(msg.addresses);
        const res = [];
        for (const slice of multi) {
            for (const node of (await slice)) {
                // Do not include duplicates.
                if (res.indexOf(node) < 0) res.push(node);
            }
        }
        this._peer.channel.accounts(res);
    }

    _onClose() {
        // Clear all timers and intervals when the peer disconnects.
        this._timers.clearAll();

        this.fire('close', this);
    }

    get peer() {
        return this._peer;
    }

    get synced() {
        return this._synced;
    }
}
// Number of InvVectors in invToRequest pool to automatically trigger a getdata request.
ConsensusAgent.REQUEST_THRESHOLD = 50;
// Time to wait after the last received inv message before sending getdata.
ConsensusAgent.REQUEST_THROTTLE = 500; // ms
// Maximum time to wait after sending out getdata or receiving the last object for this request.
ConsensusAgent.REQUEST_TIMEOUT = 5000; // ms
// Maximum number of blockchain sync retries before closing the connection.
// XXX If the peer is on a long fork, it will count as a failed sync attempt
// if our blockchain doesn't switch to the fork within 500 (max InvVectors returned by getblocks)
// blocks.
ConsensusAgent.MAX_SYNC_ATTEMPTS = 5;
// Maximum number of inventory vectors to sent in the response for onGetBlocks.
ConsensusAgent.GETBLOCKS_VECTORS_MAX = 500;
// Number of blocks to verify in the mini client.
ConsensusAgent.NUM_BLOCKS_VERIFY_MINI = 50;
Class.register(ConsensusAgent);
