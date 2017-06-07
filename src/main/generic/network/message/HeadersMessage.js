class HeadersMessage extends Message {
    constructor(headers) {
        super(Message.Type.HEADERS);
        if (!headers || !NumberUtils.isUint16(headers.length)
            || headers.some(it => !(it instanceof BlockHeader))
            || headers.length > HeadersMessage.LENGTH_MAX) throw 'Malformed headers';
        this._headers = headers;
    }

    static unserialize(buf) {
        Message.unserialize(buf);
        const count = buf.readUint16();
        const headers = [];
        for (let i = 0; i < count; ++i) {
            headers.push(BlockHeader.unserialize(buf));
        }
        return new HeadersMessage(headers);
    }

    serialize(buf) {
        buf = buf || new SerialBuffer(this.serializedSize);
        super.serialize(buf);
        buf.writeUint16(this._headers.length);
        for (const header of this._headers) {
            header.serialize(buf);
        }
        super._setChecksum(buf);
        return buf;
    }

    get serializedSize() {
        let size = super.serializedSize
            + /*count*/ 2;
        for (const header of this._headers) {
            size += header.serializedSize;
        }
        return size;
    }

    get headers() {
        return this._headers;
    }
}
HeadersMessage.LENGTH_MAX = 2000;
Class.register(HeadersMessage);
