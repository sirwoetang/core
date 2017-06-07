// Note: reverseDirection bool is stored in topmost bit of maxNumAndReverse on wire.
class GetHeadersMessage extends Message {
    constructor(hashes, hashTarget, maxNum, reverseDirection) {
        super(Message.Type.GETHEADERS);
        if (!hashes || !NumberUtils.isUint16(hashes.length)
            || hashes.some(it => !(it instanceof Hash))) throw 'Malformed hashes';
        if (!maxNum || !NumberUtils.isUint16(maxNum) || maxNum > HeadersMessage.LENGTH_MAX) throw 'Malformed maxNum';
        this._hashes = hashes;
        this._hashStop = hashTarget;
        this._maxNum = maxNum;
        this._reverseDirection = reverseDirection;
    }

    static unserialize(buf) {
        Message.unserialize(buf);
        const count = buf.readUint16();
        const hashes = [];
        for (let i = 0; i < count; i++) {
            hashes.push(Hash.unserialize(buf));
        }
        const hashStop = Hash.unserialize(buf);
        const maxNumAndReverse = buf.readUint16();
        return new GetHeadersMessage(hashes, hashStop, maxNumAndReverse & 0x7fff, maxNumAndReverse & 0x8000 > 0);
    }

    serialize(buf) {
        buf = buf || new SerialBuffer(this.serializedSize);
        super.serialize(buf);
        buf.writeUint16(this._hashes.length);
        for (const hash of this._hashes) {
            hash.serialize(buf);
        }
        this._hashStop.serialize(buf);
        buf.writeUint16(this._maxNum + (this._reverseDirection ? 0x8000 : 0));
        super._setChecksum(buf);
        return buf;
    }

    get serializedSize() {
        let size = super.serializedSize
            + /*count*/ 2
            + this._hashStop.serializedSize
            + /*maxNumAndReverse*/ 2;
        for (const hash of this._hashes) {
            size += hash.serializedSize;
        }
        return size;
    }

    get hashes() {
        return this._hashes;
    }

    get hashStop() {
        return this._hashStop;
    }

    get maxNum() {
        return this._maxNum;
    }

    get reverseDirection() {
        return this._reverseDirection;
    }
}
Class.register(GetHeadersMessage);
