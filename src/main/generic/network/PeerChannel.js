class PeerChannel extends Observable {
    constructor(connection) {
        super();
        this._conn = connection;
        this._conn.on('message', msg => this._onMessage(msg));
        this._promise = new NetworkPromise(this);

        // Forward specified events on the connection to listeners of this Observable.
        this.bubble(this._conn, 'close', 'error', 'ban');
    }

    _onMessage(rawMsg) {
        let msg;
        try {
            msg = MessageFactory.parse(rawMsg);
        } catch (e) {
            Log.w(PeerChannel, `Failed to parse message from ${this.peerAddress || this.netAddress}: ${e}`);

            // Ban client if it sends junk.
            // TODO We should probably be more lenient here. Bitcoin sends a
            // reject message if the message can't be decoded.
            // From the Bitcoin Reference:
            //  "Be careful of reject message feedback loops where two peers
            //   each don’t understand each other’s reject messages and so keep
            //   sending them back and forth forever."
            this.ban('junk received');
        }

        if (!msg) return;

        try {
            this.fire(msg.type, msg, this);
        } catch (e) {
            Log.w(PeerChannel, `Error while processing ${msg.type} message from ${this.peerAddress || this.netAddress}: ${e}`);
        }
    }

    _send(msg) {
        return this._conn.send(msg.serialize());
    }

    close(reason) {
        this._conn.close(reason);
    }

    ban(reason) {
        this._conn.ban(reason);
    }

    version(peerAddress, startHeight, totalWork) {
        return this._send(new VersionMessage(Version.CODE, peerAddress, Block.GENESIS.HASH, startHeight, totalWork));
    }

    verack() {
        return this._send(new VerAckMessage());
    }

    inv(vectors) {
        return this._send(new InvMessage(vectors));
    }

    getdata(vectors) {
        return this._send(new GetDataMessage(vectors));
    }

    notfound(vectors) {
        return this._send(new NotFoundMessage(vectors));
    }

    getblocks(hashes, hashStop = new Hash(null)) {
        return this._send(new GetBlocksMessage(hashes, hashStop));
    }

    getheaders(hashes, hashStop = new Hash(null), maxNum = HeadersMessage.LENGTH_MAX, reverseDirection = false) {
        return this._send(new GetHeadersMessage(hashes, hashStop, maxNum, reverseDirection));
    }

    tx(transaction) {
        return this._send(new TxMessage(transaction));
    }

    block(block) {
        return this._send(new BlockMessage(block));
    }

    headers(headers) {
        return this._send(new HeadersMessage(headers));
    }

    mempool() {
        return this._send(new MempoolMessage());
    }

    reject(messageType, code, reason, extraData) {
        return this._send(new RejectMessage(messageType, code, reason, extraData));
    }

    addr(addresses) {
        return this._send(new AddrMessage(addresses));
    }

    getaddr(protocolMask, serviceMask) {
        return this._send(new GetAddrMessage(protocolMask, serviceMask));
    }

    ping(nonce) {
        return this._send(new PingMessage(nonce));
    }

    pong(nonce) {
        return this._send(new PongMessage(nonce));
    }

    signal(senderId, recipientId, nonce, ttl, flags, payload) {
        return this._send(new SignalMessage(senderId, recipientId, nonce, ttl, flags, payload));
    }

    getaccounts(addresses, height=0) {
        return this._send(new GetAccountsMessage(addresses, height));
    }

    accounts(nodes, height=0) {
        return this._send(new AccountsMessage(nodes, height));
    }

    equals(o) {
        return o instanceof PeerChannel
            && this._conn.equals(o.connection);
    }

    hashCode() {
        return this._conn.hashCode();
    }

    toString() {
        return 'PeerChannel{conn=' + this._conn + '}';
    }

    get connection() {
        return this._conn;
    }

    get id() {
        return this._conn.id;
    }

    get promise() {
        return this._promise;
    }

    get protocol() {
        return this._conn.protocol;
    }

    get peerAddress() {
        return this._conn.peerAddress;
    }

    set peerAddress(value) {
        this._conn.peerAddress = value;
    }

    get netAddress() {
        return this._conn.netAddress;
    }

    set netAddress(value) {
        this._conn.netAddress = value;
    }

    get closed() {
        return this._conn.closed;
    }
}
Class.register(PeerChannel);
