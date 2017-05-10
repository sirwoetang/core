class BlockHeader {
    constructor(prevHash, bodyHash, accountsHash, difficulty, timestamp, nonce) {
        if (!Hash.isHash(prevHash)) throw 'Malformed prevHash';
        if (!Hash.isHash(bodyHash)) throw 'Malformed bodyHash';
        if (!Hash.isHash(accountsHash)) throw 'Malformed accountsHash';
        if (!NumberUtils.isUint32(difficulty)) throw 'Malformed difficulty';
        if (!NumberUtils.isUint64(timestamp)) throw 'Malformed timestamp';
        if (!NumberUtils.isUint64(nonce)) throw 'Malformed nonce';

        this._prevHash = prevHash;
        this._bodyHash = bodyHash;
        this._accountsHash = accountsHash;
        this._difficulty = difficulty;
        this._timestamp = timestamp;
        this._nonce = nonce;
    }

    static cast(o) {
        if (!o) return o;
        ObjectUtils.cast(o, BlockHeader);
        o._prevHash = new Hash(o._prevHash);
        o._bodyHash = new Hash(o._bodyHash);
        o._accountsHash = new Hash(o._accountsHash);
        // XXX clear out cached hash
        o._hash = undefined;
        return o;
	}

    static unserialize(buf) {
        var prevHash = Hash.unserialize(buf);
        var bodyHash = Hash.unserialize(buf);
        var accountsHash = Hash.unserialize(buf);
        var difficulty = buf.readUint32();
        var timestamp = buf.readUint64();
        var nonce = buf.readUint64();
        return new BlockHeader(prevHash, bodyHash, accountsHash, difficulty, timestamp, nonce);
    }

    serialize(buf) {
        buf = buf || new SerialBuffer(this.serializedSize);
        this._prevHash.serialize(buf);
        this._bodyHash.serialize(buf);
        this._accountsHash.serialize(buf);
        buf.writeUint32(this._difficulty);
        buf.writeUint64(this._timestamp);
        buf.writeUint64(this._nonce);
        return buf;
    }

    get serializedSize() {
        return this._prevHash.serializedSize
            + this._bodyHash.serializedSize
            + this._accountsHash.serializedSize
            + /*difficulty*/ 4
            + /*timestamp*/ 8
            + /*nonce*/ 8;
    }

    verifyProofOfWork() {
        return this.hash()
            .then( hash => BlockHeader.isProofOfWork(hash, this.difficulty));
    }

    async hash() {
        this._hash = this._hash || await Crypto.sha256(this.serialize());
        return this._hash;
    }

    equals(o) {
        return o instanceof BlockHeader
            && this._prevHash.equals(o.prevHash)
            && this._bodyHash.equals(o.bodyHash)
            && this._accountsHash.equals(o.accountsHash)
            && this._difficulty === o.difficulty
            && this._timestamp === o.timestamp
            && this._nonce === o.nonce;
    }

    get prevHash() {
        return this._prevHash;
    }

    get bodyHash() {
        return this._bodyHash;
    }

    get accountsHash() {
        return this._accountsHash;
    }

    get difficulty() {
        return this._difficulty;
    }

    get timestamp() {
        return this._timestamp;
    }

    get nonce() {
        return this._nonce;
    }

    // XXX The miner changes the nonce of an existing BlockHeader during the
    // mining process.
    set nonce(value) {
        this._nonce = value;
        this._hash = null;
    }

    // XXX Testing
    static setNonce(buffer, nonce) {
        const writePos = buffer.writePos;
        buffer.writePos = 108;
        buffer.writeUint64(nonce);
        buffer.writePos = writePos;
    }

    // XXX Testing
    // Verify that leadingZeros(hash) == difficulty
    static isProofOfWork(hash, difficulty) {
        const zeroBytes = Math.floor(difficulty / 8);
        for (let i = 0; i < zeroBytes; i++) {
            if (hash[i] !== 0) return false;
        }
        const zeroBits = difficulty % 8;
        if (zeroBits && hash[zeroBytes] > Math.pow(2, 8 - zeroBits)) return false;
        return true;
    }

    log(desc) {
        super.log(desc, `BlockHeader
            prev: ${Buffer.toBase64(this._prevHash)}
            tx-root: ${Buffer.toBase64(this._bodyHash)}
            state-root: ${Buffer.toBase64(this._accountsHash)}
            difficulty: ${this._difficulty}, timestamp: ${this._timestamp}, nonce: ${this._nonce}`);
    }

}
Class.register(BlockHeader);
